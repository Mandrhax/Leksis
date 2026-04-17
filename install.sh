#!/usr/bin/env bash
# ============================================================
# Leksis Deployment Script
# Usage: ./install.sh [install|update|uninstall|status|config|logs]
#
# install    - Full guided installation on a fresh server
# update     - Update one or more containers selectively
# uninstall  - Clean removal of all Leksis components
# status     - Show live status of all services
# config     - Edit environment variables (.env)
# logs       - Tail logs of a service
#
# Run from a server via curl (stdin-safe):
#   bash <(curl -fsSL https://raw.githubusercontent.com/Mandrhax/Leksis/main/install.sh)
# ============================================================
set -euo pipefail

# ── Stdin guard ──────────────────────────────────────────────
# Interactive prompts require stdin to be a terminal.
# "curl url | bash" pipes stdin -- use "bash <(curl url)" instead.
if [[ ! -t 0 ]]; then
  echo ""
  echo "ERROR: stdin is not a terminal -- interactive prompts will not work."
  echo ""
  echo "Run this script with:"
  echo "  bash <(curl -fsSL https://raw.githubusercontent.com/Mandrhax/Leksis/main/install.sh)"
  echo ""
  echo "Or download it first:"
  echo "  curl -fsSL https://raw.githubusercontent.com/Mandrhax/Leksis/main/install.sh -o install.sh"
  echo "  chmod +x install.sh && sudo ./install.sh"
  echo ""
  exit 1
fi

# ── VERSION from package.json ────────────────────────────────
VERSION="1.0.0"
_pkg="$(dirname "$0")/package.json"
if [[ -f "$_pkg" ]]; then
  _v=$(grep '"version"' "$_pkg" \
    | sed 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' \
    | head -1)
  VERSION="${_v:-1.0.0}"
  unset _v
fi
unset _pkg

# ── Plain-text UI helpers ─────────────────────────────────────

p_header() {
  echo ""
  echo "============================================================"
  printf '  %s\n' "$1"
  echo "============================================================"
}

p_info() { printf '  --> %s\n' "$1"; }
p_ok()   { printf '  [OK] %s\n' "$1"; }
p_warn() { printf '  [!]  %s\n' "$1"; }
p_err()  { printf '  [ERROR] %s\n' "$1" >&2; }

# p_input "prompt" "default"  ->  prints value to stdout
p_input() {
  local prompt="$1" default="${2:-}" value
  if [[ -n "$default" ]]; then
    printf '  %s [%s]: ' "$prompt" "$default" >/dev/tty
  else
    printf '  %s: ' "$prompt" >/dev/tty
  fi
  read -r value </dev/tty
  printf '%s' "${value:-$default}"
}

# p_yesno "question" "y|n"  ->  0=Yes / 1=No
p_yesno() {
  local question="$1" default="${2:-y}" answer hint
  [[ "$default" == "y" ]] && hint="[Y/n]" || hint="[y/N]"
  while true; do
    printf '  %s %s: ' "$question" "$hint" >/dev/tty
    read -r answer </dev/tty
    answer="${answer:-$default}"
    case "${answer,,}" in
      y|yes) return 0 ;;
      n|no)  return 1 ;;
      *) p_warn "Please answer y or n." ;;
    esac
  done
}

# p_password "prompt"  ->  prints password to stdout (empty = auto-generate)
p_password() {
  local p1 p2
  while true; do
    printf '  %s (empty = auto-generate): ' "$1" >/dev/tty
    read -rs p1 </dev/tty; echo >/dev/tty
    if [[ -z "$p1" ]]; then printf '%s' ""; return 0; fi
    printf '  Confirm password: ' >/dev/tty
    read -rs p2 </dev/tty; echo >/dev/tty
    if [[ "$p1" == "$p2" ]]; then printf '%s' "$p1"; return 0; fi
    p_warn "Passwords do not match. Try again."
  done
}

# ── Validation helpers ────────────────────────────────────────
validate_url() {
  [[ "$1" =~ ^https?://[^[:space:]]+[^/]$ ]]
}

validate_email() {
  [[ "$1" =~ ^[^@]+@[^@]+\.[^@]+$ ]]
}

# ── Package manager detection ─────────────────────────────────
PKG_INSTALL=""

detect_pkg_manager() {
  if   command -v apt-get &>/dev/null; then PKG_INSTALL="apt-get install -y"
  elif command -v dnf     &>/dev/null; then PKG_INSTALL="dnf install -y"
  elif command -v yum     &>/dev/null; then PKG_INSTALL="yum install -y"
  else
    PKG_INSTALL="echo Skipping:"
  fi
}

# ── Root check ────────────────────────────────────────────────
check_root() {
  if [[ $EUID -ne 0 ]]; then
    p_err "This script must be run as root (or with sudo)."
    p_err "Please re-run:  sudo ./install.sh"
    exit 1
  fi
}

# ── Dependency checks ─────────────────────────────────────────
check_deps() {
  local missing=()
  command -v git     &>/dev/null || missing+=("git")
  command -v openssl &>/dev/null || missing+=("openssl")
  command -v curl    &>/dev/null || missing+=("curl")
  command -v lspci   &>/dev/null || missing+=("pciutils")
  if [[ ${#missing[@]} -gt 0 ]]; then
    p_info "Installing missing system packages: ${missing[*]}"
    $PKG_INSTALL "${missing[@]}" >/dev/null 2>&1 || true
  fi
}

# ── Docker installation ───────────────────────────────────────
install_docker() {
  if command -v docker &>/dev/null && docker compose version &>/dev/null 2>&1; then
    p_ok "Docker $(docker --version | cut -d' ' -f3 | tr -d ',') with Compose v2 already installed."
    return 0
  fi

  p_info "Downloading and running Docker installer from get.docker.com..."
  curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
  sh /tmp/get-docker.sh
  rm -f /tmp/get-docker.sh

  systemctl enable docker 2>/dev/null || true
  systemctl start  docker 2>/dev/null || true
  sleep 3

  if ! docker compose version &>/dev/null 2>&1; then
    p_info "Installing docker-compose-plugin..."
    $PKG_INSTALL docker-compose-plugin >/dev/null 2>&1 || \
      $PKG_INSTALL docker-compose      >/dev/null 2>&1 || true
    sleep 2
  fi

  if ! docker compose version &>/dev/null 2>&1; then
    p_err "Docker Compose v2 could not be installed. Please install it manually and re-run."
    exit 1
  fi
}

# ── GPU detection (multi-vendor) ──────────────────────────────
GPU_VENDOR=""
GPU_NAME=""

detect_gpu() {
  GPU_VENDOR=""
  GPU_NAME=""

  # 1. lspci: scan ALL lines for vendor keywords (not just VGA/3D controller class)
  if command -v lspci &>/dev/null; then
    local nvidia_line amd_line
    nvidia_line=$(lspci | grep -i "nvidia" | head -1 || true)
    amd_line=$(lspci | grep -iE "amd|radeon|advanced micro" | grep -iE "vga|3d|display|gpu" | head -1 || true)
    if [[ -n "$nvidia_line" ]]; then
      GPU_VENDOR="nvidia"
      GPU_NAME=$(echo "$nvidia_line" | sed 's/.*\[//' | sed 's/\].*//' || echo "$nvidia_line" | sed 's/.*: //')
    elif [[ -n "$amd_line" ]]; then
      GPU_VENDOR="amd"
      GPU_NAME=$(echo "$amd_line" | sed 's/.*: //')
    fi
  fi

  # 2. nvidia-smi (works if driver already installed, even without lspci)
  if [[ -z "$GPU_VENDOR" ]] && command -v nvidia-smi &>/dev/null \
      && nvidia-smi --query-gpu=name --format=csv,noheader &>/dev/null 2>&1; then
    GPU_VENDOR="nvidia"
    GPU_NAME=$(nvidia-smi --query-gpu=name --format=csv,noheader | head -1 || true)
  fi

  # 3. /dev/nvidia0 device node (driver loaded but nvidia-smi not in PATH)
  if [[ -z "$GPU_VENDOR" ]] && [[ -e /dev/nvidia0 ]]; then
    GPU_VENDOR="nvidia"
    GPU_NAME="NVIDIA GPU"
  fi

  # 4. lsmod (kernel module loaded)
  if [[ -z "$GPU_VENDOR" ]] && command -v lsmod &>/dev/null; then
    if lsmod | grep -q "^nvidia "; then
      GPU_VENDOR="nvidia"
      GPU_NAME="NVIDIA GPU"
    elif lsmod | grep -q "^amdgpu "; then
      GPU_VENDOR="amd"
      GPU_NAME="AMD GPU"
    fi
  fi

  # 5. rocm-smi
  if [[ -z "$GPU_VENDOR" ]] && command -v rocm-smi &>/dev/null; then
    GPU_VENDOR="amd"
  fi

  # Intel GPU: experimental SYCL only — fall back to CPU
  if [[ "$GPU_VENDOR" == "intel" ]]; then
    GPU_VENDOR=""
    GPU_NAME=""
  fi
}

# ── GPU toolkit installation ──────────────────────────────────

NVIDIA_DRIVER_VERSION="580.142"
NVIDIA_DRIVER_URL="https://us.download.nvidia.com/XFree86/Linux-x86_64/${NVIDIA_DRIVER_VERSION}/NVIDIA-Linux-x86_64-${NVIDIA_DRIVER_VERSION}.run"
NVIDIA_DRIVER_RUN="/tmp/NVIDIA-Linux-x86_64-${NVIDIA_DRIVER_VERSION}.run"

_install_nvidia_driver() {
  if command -v nvidia-smi &>/dev/null; then
    local installed_ver
    installed_ver=$(nvidia-smi --query-gpu=driver_version --format=csv,noheader 2>/dev/null | head -1 || true)
    if [[ -n "$installed_ver" ]]; then
      p_ok "NVIDIA driver ${installed_ver} already installed."
      return 0
    fi
  fi

  p_info "Installing kernel build dependencies..."
  apt-get install -y \
    build-essential dkms "linux-headers-$(uname -r)" \
    pkg-config libglvnd-dev >/dev/null 2>&1

  local nouveau_conf="/etc/modprobe.d/blacklist-nouveau.conf"
  if [[ ! -f "$nouveau_conf" ]]; then
    p_info "Blacklisting nouveau driver..."
    tee "$nouveau_conf" >/dev/null <<'EOF'
blacklist nouveau
options nouveau modeset=0
EOF
    update-initramfs -u >/dev/null 2>&1 || true
    echo ""
    p_warn "Nouveau has been blacklisted. A reboot is required to unload it."
    p_warn "Please reboot now and re-run the installer:"
    p_warn "  sudo reboot"
    echo ""
    exit 0
  fi

  # After reboot: confirm nouveau is fully unloaded (lsmod + sysfs)
  if lsmod | grep -q "nouveau" || ls /sys/bus/pci/drivers/nouveau/ 2>/dev/null | grep -q "."; then
    echo ""
    p_warn "The nouveau driver is still active after reboot."
    p_warn "Please reboot again and re-run the installer:"
    p_warn "  sudo reboot"
    echo ""
    exit 0
  fi

  if [[ ! -f "$NVIDIA_DRIVER_RUN" ]]; then
    p_info "Downloading NVIDIA driver ${NVIDIA_DRIVER_VERSION}..."
    curl -fL "$NVIDIA_DRIVER_URL" -o "$NVIDIA_DRIVER_RUN"
  fi
  chmod +x "$NVIDIA_DRIVER_RUN"

  p_info "Installing NVIDIA driver ${NVIDIA_DRIVER_VERSION} (this may take 10-15 minutes)..."
  p_info "Compiling kernel module via DKMS — do not interrupt..."
  "$NVIDIA_DRIVER_RUN" --dkms --no-questions --accept-license 2>&1 | tee /var/log/nvidia-install.log
}

_install_nvidia_toolkit() {
  if docker info 2>/dev/null | grep -q "nvidia"; then
    p_ok "nvidia-container-toolkit already configured."
    return 0
  fi

  p_info "Installing nvidia-container-toolkit..."
  command -v gpg &>/dev/null || $PKG_INSTALL gnupg2 >/dev/null 2>&1
  curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
    | gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
  curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
    | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
    | tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
  apt-get update -qq
  apt-get install -y nvidia-container-toolkit
  nvidia-ctk runtime configure --runtime=docker
  systemctl restart docker
  p_ok "nvidia-container-toolkit installed."
}

_install_amd_rocm() {
  if docker info 2>/dev/null | grep -q "rocm\|amdgpu"; then
    p_ok "ROCm already configured."
    return 0
  fi
  local codename
  codename=$(. /etc/os-release 2>/dev/null && echo "${UBUNTU_CODENAME:-jammy}")
  p_info "Installing AMD ROCm..."
  curl -fsSL \
    "https://repo.radeon.com/amdgpu-install/latest/ubuntu/${codename}/amdgpu-install_6.3.60300-1_all.deb" \
    -o /tmp/amdgpu-install.deb
  $PKG_INSTALL /tmp/amdgpu-install.deb
  amdgpu-install -y --usecase=rocm --no-dkms
  usermod -aG render,video root
  p_ok "AMD ROCm installed."
}

install_gpu_toolkit() {
  case "${GPU_VENDOR:-}" in
    nvidia) _install_nvidia_driver; _install_nvidia_toolkit ;;
    amd)    _install_amd_rocm ;;
    *)      return 0 ;;
  esac
}

# ── Shared helpers ────────────────────────────────────────────
COMPOSE_CMD="docker compose"
OLLAMA_IMAGE="ollama/ollama:latest"
COMPOSE_FILE_VALUE="docker-compose.yml"

resolve_compose_cmd() {
  case "${GPU_VENDOR:-}" in
    nvidia)
      if docker info 2>/dev/null | grep -q "nvidia"; then
        COMPOSE_CMD="docker compose -f docker-compose.yml -f docker-compose.nvidia.yml"
        COMPOSE_FILE_VALUE="docker-compose.yml:docker-compose.nvidia.yml"
        OLLAMA_IMAGE="ollama/ollama:latest"
      else
        COMPOSE_CMD="docker compose"
        COMPOSE_FILE_VALUE="docker-compose.yml"
        OLLAMA_IMAGE="ollama/ollama:latest"
      fi ;;
    amd)
      COMPOSE_CMD="docker compose -f docker-compose.yml -f docker-compose.amd.yml"
      COMPOSE_FILE_VALUE="docker-compose.yml:docker-compose.amd.yml"
      OLLAMA_IMAGE="ollama/ollama:rocm" ;;
    *)
      COMPOSE_CMD="docker compose"
      COMPOSE_FILE_VALUE="docker-compose.yml"
      OLLAMA_IMAGE="ollama/ollama:latest" ;;
  esac
}

detect_branch() {
  local dir="${1:-.}"
  git -C "$dir" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main"
}

pg_backup() {
  local install_dir="$1"
  local backup_dir="${install_dir}/backups"
  local backup_file="${backup_dir}/leksis-pg-$(date +%Y%m%d-%H%M%S).sql"
  mkdir -p "$backup_dir"
  p_info "Creating PostgreSQL backup: ${backup_file}"
  if docker compose -f "${install_dir}/docker-compose.yml" exec -T postgres \
      pg_dump -U leksis_user leksis > "$backup_file" 2>/dev/null; then
    p_ok "Backup saved to: ${backup_file}"
  else
    p_warn "PostgreSQL backup failed (container may be offline). Continuing without backup."
    rm -f "$backup_file"
  fi
}

pull_model_if_needed() {
  local model="$1"
  if $COMPOSE_CMD exec -T ollama ollama list 2>/dev/null | grep -q "^${model}"; then
    p_ok "Model already present: ${model}"
  else
    p_info "Pulling model: ${model} (this may take a while)..."
    $COMPOSE_CMD exec -T ollama ollama pull "$model"
    p_ok "Model pulled: ${model}"
  fi
}

wait_healthy() {
  local service="$1"
  local max_wait="${2:-180}"
  local elapsed=0
  while [[ $elapsed -lt $max_wait ]]; do
    printf '\r  --> Waiting for %s to be healthy... (%ds / %ds)' \
      "$service" "$elapsed" "$max_wait"
    local status
    status=$(docker inspect --format='{{.State.Health.Status}}' \
             "leksis-${service}" 2>/dev/null || echo "")
    if [[ "$status" == "healthy" ]]; then
      printf '\r  [OK] %s is healthy.                                  \n' "$service"
      return 0
    fi
    sleep 5
    elapsed=$((elapsed + 5))
  done
  echo ""
  p_warn "${service} did not become healthy within ${max_wait}s."
  p_warn "Check logs with:  docker compose logs ${service}"
  return 1
}

show_volumes_info() {
  local install_dir="$1"
  for vol in leksis_postgres_data leksis_ollama_data; do
    local mountpoint
    mountpoint=$(docker volume inspect "$vol" --format='{{.Mountpoint}}' 2>/dev/null || echo "")
    if [[ -n "$mountpoint" ]]; then
      printf '  %-32s  %s\n' "$vol" "$(du -sh "$mountpoint" 2>/dev/null | cut -f1 || echo '?')"
    else
      printf '  %-32s  %s\n' "$vol" "(not found)"
    fi
  done
}

# ── Env file helper ───────────────────────────────────────────
_env_set() {
  local key="$1" value="$2" envfile="$3"
  sed -i "s|^${key}=.*|${key}=${value}|" "$envfile"
}

# ── Mode: install ─────────────────────────────────────────────
cmd_install() {
  check_root
  detect_pkg_manager

  p_header "Leksis v${VERSION} - Installation"

  # System requirements
  p_info "Checking system requirements..."
  check_deps
  p_info "Setting up Docker..."
  install_docker
  p_info "Detecting GPU..."
  detect_gpu

  # Manual fallback: if lspci sees a GPU but auto-detection failed, let user confirm
  if [[ -z "${GPU_VENDOR:-}" ]]; then
    local _lspci_hint
    _lspci_hint=$(lspci 2>/dev/null | grep -iE "nvidia|radeon|amd" | head -3 || true)
    if [[ -n "$_lspci_hint" ]]; then
      echo ""
      p_warn "GPU hardware detected by lspci but vendor could not be identified automatically:"
      echo "$_lspci_hint" | while IFS= read -r l; do printf '    %s\n' "$l"; done
      echo ""
      if p_yesno "Is this an NVIDIA GPU?" "y"; then
        GPU_VENDOR="nvidia"
        GPU_NAME=$(echo "$_lspci_hint" | head -1 | sed 's/.*\[//' | sed 's/\].*//' || true)
      elif p_yesno "Is this an AMD GPU?" "n"; then
        GPU_VENDOR="amd"
        GPU_NAME=$(echo "$_lspci_hint" | head -1 | sed 's/.*: //' || true)
      fi
    fi
  fi

  local _gpu_label="CPU-only mode"
  case "${GPU_VENDOR:-}" in
    nvidia) _gpu_label="NVIDIA GPU${GPU_NAME:+: ${GPU_NAME}}" ;;
    amd)    _gpu_label="AMD GPU${GPU_NAME:+: ${GPU_NAME}}" ;;
  esac
  p_ok "GPU: ${_gpu_label}"
  install_gpu_toolkit
  resolve_compose_cmd

  # ── Step 1/5: Installation paths ──────────────────────────
  p_header "Configuration 1/5 - Installation Paths"

  local INSTALL_DIR REPO_URL
  INSTALL_DIR=$(p_input "Install directory" "/opt/leksis")
  REPO_URL=$(p_input "Repository URL" "https://github.com/Mandrhax/Leksis.git")

  # ── Step 2/5: Application URL ──────────────────────────────
  p_header "Configuration 2/5 - Application URL"

  local raw_host CADDY_HOST APP_URL
  raw_host=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "127.0.0.1")
  raw_host=$(p_input "Domain name or IP address (no protocol, no port)" "$raw_host")

  # Bare IPv4 → Caddy listens on all interfaces (:80), NEXTAUTH_URL uses the IP
  # Domain   → Caddy uses the domain for Let's Encrypt
  if [[ "$raw_host" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    CADDY_HOST=":80"
    APP_URL="http://${raw_host}"
  else
    CADDY_HOST="$raw_host"
    APP_URL="https://${raw_host}"
  fi
  p_ok "Caddy host : ${CADDY_HOST}"
  p_ok "App URL    : ${APP_URL}"

  # ── Step 3/5: Admin account ────────────────────────────────
  p_header "Configuration 3/5 - Admin Account"
  echo "  (leave email empty to skip admin user creation)"

  local ADMIN_EMAIL="" ADMIN_NAME="Admin"
  while true; do
    ADMIN_EMAIL=$(p_input "Admin email (optional)" "")
    ADMIN_NAME=$(p_input "Admin display name" "Admin")
    if [[ -z "$ADMIN_EMAIL" ]] || validate_email "$ADMIN_EMAIL"; then break; fi
    p_warn "Invalid email address: ${ADMIN_EMAIL}"
    p_warn "Please enter a valid email or leave it empty."
  done

  # ── Step 4/5: Ollama models ────────────────────────────────
  p_header "Configuration 4/5 - Ollama Models"

  local OLLAMA_MODEL OLLAMA_OCR_MODEL OLLAMA_REWRITE_MODEL
  OLLAMA_MODEL=$(p_input "Translation model" "translategemma:27b")
  OLLAMA_OCR_MODEL=$(p_input "OCR model" "maternion/LightOnOCR-2")
  OLLAMA_REWRITE_MODEL=$(p_input "Rewrite model" "qwen2.5:14b")

  # ── Step 5/5: Ollama runtime ───────────────────────────────
  p_header "Configuration 5/5 - Ollama Runtime"

  local OLLAMA_KEEP_ALIVE OLLAMA_SCHED_SPREAD OLLAMA_MAX_LOADED_MODELS
  OLLAMA_KEEP_ALIVE=$(p_input "Keep alive (-1=forever, 5m=5min, 0=unload)" "-1")
  OLLAMA_SCHED_SPREAD=$(p_input "GPU scheduling spread (true/false)" "false")
  OLLAMA_MAX_LOADED_MODELS=$(p_input "Max models loaded in VRAM" "3")

  # ── PostgreSQL password ────────────────────────────────────
  p_header "PostgreSQL Password"

  local POSTGRES_PASSWORD
  POSTGRES_PASSWORD=$(p_password "Database password")
  if [[ -z "$POSTGRES_PASSWORD" ]]; then
    POSTGRES_PASSWORD=$(openssl rand -hex 16)
    p_ok "Auto-generated PostgreSQL password."
  fi

  # ── Secrets ────────────────────────────────────────────────
  p_info "Generating AUTH_SECRET and ENCRYPTION_KEY..."
  local AUTH_SECRET ENCRYPTION_KEY
  AUTH_SECRET=$(openssl rand -base64 32)
  ENCRYPTION_KEY=$(openssl rand -hex 32)

  # ── Clone / update repository ──────────────────────────────
  p_header "Repository"

  if [[ -d "$INSTALL_DIR/.git" ]]; then
    local BRANCH; BRANCH=$(detect_branch "$INSTALL_DIR")
    p_info "Pulling latest changes (branch: ${BRANCH})..."
    git -C "$INSTALL_DIR" pull origin "$BRANCH"
  elif [[ -d "$INSTALL_DIR" ]]; then
    p_warn "${INSTALL_DIR} exists but is not a git repository."
    if p_yesno "Empty it and clone fresh?" "n"; then
      cd /tmp
      rm -rf "$INSTALL_DIR"
      p_info "Cloning from GitHub..."
      git clone "$REPO_URL" "$INSTALL_DIR"
    else
      p_info "Installation aborted."; return 0
    fi
  else
    p_info "Cloning from GitHub..."
    git clone "$REPO_URL" "$INSTALL_DIR"
  fi
  p_ok "Repository ready at ${INSTALL_DIR}"

  # ── Build .env ─────────────────────────────────────────────
  local ENV_CONTENT
  ENV_CONTENT=$(cat <<EOF
# Generated by install.sh on $(date -u +"%Y-%m-%dT%H:%M:%SZ")

POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_VERSION=18
DATABASE_URL=postgresql://leksis_user:${POSTGRES_PASSWORD}@postgres:5432/leksis
AUTH_SECRET=${AUTH_SECRET}
NEXTAUTH_URL=${APP_URL}
AUTH_TRUST_HOST=1
CADDY_HOST=${CADDY_HOST}
ENCRYPTION_KEY=${ENCRYPTION_KEY}
COMPOSE_FILE=${COMPOSE_FILE_VALUE}
OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_IMAGE=${OLLAMA_IMAGE}
OLLAMA_MODEL=${OLLAMA_MODEL}
OLLAMA_OCR_MODEL=${OLLAMA_OCR_MODEL}
OLLAMA_REWRITE_MODEL=${OLLAMA_REWRITE_MODEL}
OLLAMA_KEEP_ALIVE=${OLLAMA_KEEP_ALIVE}
OLLAMA_SCHED_SPREAD=${OLLAMA_SCHED_SPREAD}
OLLAMA_MAX_LOADED_MODELS=${OLLAMA_MAX_LOADED_MODELS}
EOF
)

  # .env preview (secrets masked)
  p_header ".env Preview (secrets masked)"
  while IFS= read -r line; do
    if printf '%s' "$line" | grep -qE \
        "^(POSTGRES_PASSWORD|AUTH_SECRET|ENCRYPTION_KEY|DATABASE_URL)="; then
      printf '  %s=****\n' "${line%%=*}"
    else
      printf '  %s\n' "$line"
    fi
  done <<< "$ENV_CONTENT"

  echo ""
  if ! p_yesno "Write this configuration to ${INSTALL_DIR}/.env ?" "y"; then
    p_info "Installation aborted."; return 0
  fi
  printf '%s\n' "$ENV_CONTENT" > "$INSTALL_DIR/.env"
  chmod 600 "$INSTALL_DIR/.env"
  p_ok ".env written."

  # ── Port availability check ────────────────────────────────
  for port in "80" "443"; do
    if ss -tlnp 2>/dev/null | grep -q ":${port} " || \
       netstat -tlnp 2>/dev/null | grep -q ":${port} "; then
      p_warn "Port ${port} appears to be already in use."
      if ! p_yesno "Continue anyway?" "n"; then
        p_info "Installation aborted."; return 0
      fi
    fi
  done

  # ── Start containers ───────────────────────────────────────
  p_header "Building and Starting Containers"
  cd "$INSTALL_DIR"

  if p_yesno "Rebuild the app Docker image from source? (recommended for first install)" "y"; then
    p_info "Building Docker image (this may take several minutes)..."
    BUILDKIT_PROGRESS=plain $COMPOSE_CMD up -d --build
  else
    p_info "Starting containers..."
    $COMPOSE_CMD up -d
  fi

  # ── Wait for healthy ───────────────────────────────────────
  wait_healthy postgres 120
  wait_healthy ollama   120
  wait_healthy app      180
  wait_healthy caddy     60

  # ── Pull Ollama models ─────────────────────────────────────
  p_header "Pulling Ollama Models"
  pull_model_if_needed "$OLLAMA_MODEL"
  pull_model_if_needed "$OLLAMA_OCR_MODEL"
  pull_model_if_needed "$OLLAMA_REWRITE_MODEL"

  # ── Create admin user ──────────────────────────────────────
  if [[ -n "$ADMIN_EMAIL" ]]; then
    p_info "Creating admin user: ${ADMIN_EMAIL}..."
    local _email _name
    _email=$(printf '%s' "$ADMIN_EMAIL" | sed "s/'/''/g")
    _name=$(printf  '%s' "$ADMIN_NAME"  | sed "s/'/''/g")
    $COMPOSE_CMD exec -T postgres \
      psql -U leksis_user -d leksis \
      -c "INSERT INTO users (email, name, role) VALUES ('${_email}', '${_name}', 'admin')
          ON CONFLICT (email) DO UPDATE SET role = 'admin', name = '${_name}';" \
      2>/dev/null || true
    p_ok "Admin user created: ${ADMIN_EMAIL}"
  fi

  # ── Summary ────────────────────────────────────────────────
  local _gpu_summary="${GPU_VENDOR:-CPU}${GPU_NAME:+ - ${GPU_NAME}}"
  p_header "Installation Complete!"
  echo ""
  echo "  Leksis has been successfully deployed."
  echo ""
  echo "  App URL     : ${APP_URL}"
  echo "  Admin       : ${ADMIN_EMAIL:-not set}"
  echo "  Install dir : ${INSTALL_DIR}"
  echo "  GPU         : ${_gpu_summary}"
  echo "  Ollama      : ${OLLAMA_IMAGE}"
  echo ""
  echo "  Useful commands:"
  echo "    ./install.sh status  - show service status"
  echo "    ./install.sh logs    - tail app logs"
  echo "    ./install.sh config  - edit configuration"
  echo ""
}

# ── Mode: update ──────────────────────────────────────────────
cmd_update() {
  check_root

  p_header "Leksis v${VERSION} - Update"

  local INSTALL_DIR
  INSTALL_DIR=$(p_input "Installation directory" "/opt/leksis")

  if [[ ! -f "$INSTALL_DIR/.env" ]]; then
    p_err "Leksis does not appear to be installed at: ${INSTALL_DIR} (.env not found)"
    return 1
  fi

  # shellcheck source=/dev/null
  source "$INSTALL_DIR/.env"

  # Guard: preserve existing postgres major version
  if ! grep -q "^POSTGRES_VERSION=" "$INSTALL_DIR/.env"; then
    printf '\n# PostgreSQL version -- preserved by update guard (existing data on v16)\nPOSTGRES_VERSION=16\n' \
      >> "$INSTALL_DIR/.env"
    echo ""
    p_warn "POSTGRES_VERSION=16 has been added to your .env to preserve your existing database."
    p_warn "To upgrade to a newer PostgreSQL major version, update POSTGRES_VERSION in .env"
    p_warn "and perform a data migration first (pg_upgrade or pg_dump / pg_restore)."
  fi

  # Show current status
  p_header "Current Container Status"
  docker compose -f "$INSTALL_DIR/docker-compose.yml" ps 2>/dev/null || p_warn "(unavailable)"

  # Backup before changes
  pg_backup "$INSTALL_DIR"

  # Pull latest sources
  local BRANCH; BRANCH=$(detect_branch "$INSTALL_DIR")
  p_info "Pulling latest sources (branch: ${BRANCH})..."
  git -C "$INSTALL_DIR" pull origin "$BRANCH"

  detect_gpu
  resolve_compose_cmd

  # Select components
  p_header "Select Components to Update"
  echo "  (press Enter to accept default)"
  echo ""

  local update_app update_caddy update_postgres update_ollama update_models
  p_yesno "Update app container?"      "y" && update_app=true      || update_app=false
  p_yesno "Update caddy container?"    "n" && update_caddy=true    || update_caddy=false
  p_yesno "Update postgres container?" "n" && update_postgres=true || update_postgres=false
  p_yesno "Update ollama container?"   "n" && update_ollama=true   || update_ollama=false
  p_yesno "Update Ollama models only?" "n" && update_models=true   || update_models=false

  if [[ "$update_app" == false && "$update_caddy" == false && \
        "$update_postgres" == false && \
        "$update_ollama" == false && "$update_models" == false ]]; then
    p_info "Nothing selected. Update cancelled."
    return 0
  fi

  cd "$INSTALL_DIR"

  _update_service() {
    local svc="$1"
    p_info "Rebuilding and restarting ${svc}..."
    BUILDKIT_PROGRESS=plain $COMPOSE_CMD up -d --build "$svc"
    wait_healthy "$svc" 180
  }

  _update_models() {
    pull_model_if_needed "${OLLAMA_MODEL:-translategemma:27b}"
    pull_model_if_needed "${OLLAMA_OCR_MODEL:-maternion/LightOnOCR-2}"
    pull_model_if_needed "${OLLAMA_REWRITE_MODEL:-qwen2.5:14b}"
  }

  [[ "$update_app"      == true ]] && _update_service "app"
  [[ "$update_caddy"    == true ]] && _update_service "caddy"
  [[ "$update_postgres" == true ]] && _update_service "postgres"
  [[ "$update_ollama"   == true ]] && _update_service "ollama"
  [[ "$update_models"   == true ]] && _update_models

  p_header "Update Complete"
  p_ok "Selected components have been updated."
  p_ok "Volumes (postgres_data, ollama_data) preserved."
}

# ── Mode: uninstall ───────────────────────────────────────────
cmd_uninstall() {
  check_root

  p_header "Leksis v${VERSION} - Uninstall"

  local INSTALL_DIR
  INSTALL_DIR=$(p_input "Installation directory" "/opt/leksis")

  if [[ ! -f "$INSTALL_DIR/.env" ]]; then
    p_err "Leksis does not appear to be installed at: ${INSTALL_DIR} (.env not found)"
    return 1
  fi

  # Volume info
  p_header "Volume Disk Usage"
  show_volumes_info "$INSTALL_DIR" 2>/dev/null || p_warn "(unavailable)"

  # Optional pre-uninstall backup
  echo ""
  if p_yesno "Create a PostgreSQL backup before removal?" "y"; then
    pg_backup "$INSTALL_DIR"
  fi

  # Keep volumes?
  echo ""
  p_warn "Keep PostgreSQL data and Ollama models?"
  p_warn "  Yes = Docker volumes preserved"
  p_warn "  No  = ALL data permanently deleted"
  local KEEP_DATA=false
  if p_yesno "Keep data volumes?" "n"; then
    KEEP_DATA=true
    p_ok "Volumes will be preserved."
  else
    p_warn "All data will be permanently deleted."
  fi

  # Final typed confirmation
  echo ""
  p_warn "This will remove:"
  p_warn "  - Containers: leksis-app, leksis-postgres, leksis-ollama, leksis-caddy"
  p_warn "  - Image: leksis-app"
  p_warn "  - Directory: ${INSTALL_DIR}"
  echo ""
  local _confirm
  _confirm=$(p_input "Type DELETE to confirm (anything else cancels)" "")
  if [[ "$_confirm" != "DELETE" ]]; then
    p_info "Uninstall cancelled - no changes made."
    return 0
  fi

  cd "$INSTALL_DIR" 2>/dev/null || true

  p_info "Stopping and removing containers..."
  if [[ "$KEEP_DATA" == "true" ]]; then
    docker compose down 2>/dev/null || true
  else
    docker compose down -v 2>/dev/null || true
  fi

  echo ""
  if p_yesno "Also remove the Ollama Docker image? (may free 5-10 GB)" "n"; then
    docker image rm ollama/ollama:latest ollama/ollama:rocm 2>/dev/null || true
  fi

  p_info "Removing local image and installation directory..."
  docker image rm leksis-app 2>/dev/null || true
  cd /
  rm -rf "$INSTALL_DIR"

  p_header "Uninstall Complete"
  p_ok "Leksis has been completely removed."
  if [[ "$KEEP_DATA" == "true" ]]; then
    p_ok "Volumes were preserved. To remove them:"
    p_ok "  docker volume rm leksis_postgres_data leksis_ollama_data"
  fi
}

# ── Mode: status ──────────────────────────────────────────────
cmd_status() {
  local INSTALL_DIR
  INSTALL_DIR=$(p_input "Installation directory" "/opt/leksis")

  if [[ -f "$INSTALL_DIR/.env" ]]; then
    # shellcheck source=/dev/null
    source "$INSTALL_DIR/.env"
  fi

  p_info "Gathering service status..."
  detect_gpu

  p_header "Leksis v${VERSION} - Service Status"

  echo ""
  echo "  === Containers ==="
  docker compose -f "$INSTALL_DIR/docker-compose.yml" ps 2>/dev/null \
    || echo "    (unavailable)"

  echo ""
  echo "  === GPU ==="
  case "${GPU_VENDOR:-}" in
    nvidia) echo "    NVIDIA GPU: ${GPU_NAME}" ;;
    amd)    echo "    AMD GPU: ${GPU_NAME}" ;;
    *)      echo "    No GPU detected - CPU-only mode" ;;
  esac

  echo ""
  echo "  === Ollama Models ==="
  docker compose -f "$INSTALL_DIR/docker-compose.yml" \
    exec -T ollama ollama list 2>/dev/null \
    || echo "    (Ollama container may still be starting)"

  echo ""
  echo "  === Disk Usage (volumes) ==="
  show_volumes_info "$INSTALL_DIR" 2>/dev/null || echo "    (unavailable)"

  echo ""
  echo "  === Recent App Logs (last 20 lines) ==="
  docker compose -f "$INSTALL_DIR/docker-compose.yml" \
    logs --tail=20 app 2>/dev/null \
    || echo "    (unavailable)"
  echo ""
}

# ── Mode: logs ────────────────────────────────────────────────
cmd_logs() {
  local service="${1:-}"

  local INSTALL_DIR
  INSTALL_DIR=$(p_input "Installation directory" "/opt/leksis")

  # If service not given via CLI, ask
  if [[ -z "$service" ]]; then
    p_header "Select Service"
    echo "  1) app      - Leksis application"
    echo "  2) postgres - PostgreSQL database"
    echo "  3) ollama   - Ollama AI server"
    echo "  4) caddy    - Caddy reverse proxy"
    echo ""
    local choice
    choice=$(p_input "Service number" "1")
    case "$choice" in
      1|app)      service="app" ;;
      2|postgres) service="postgres" ;;
      3|ollama)   service="ollama" ;;
      4|caddy)    service="caddy" ;;
      *) p_warn "Unknown choice. Defaulting to app."; service="app" ;;
    esac
  fi

  p_info "Streaming logs for ${service} (Ctrl+C to stop)..."
  echo ""
  docker compose -f "$INSTALL_DIR/docker-compose.yml" logs -f "$service"
}

# ── Mode: config ──────────────────────────────────────────────
cmd_config() {
  check_root

  p_header "Leksis v${VERSION} - Configuration"

  local INSTALL_DIR
  INSTALL_DIR=$(p_input "Installation directory" "/opt/leksis")

  if [[ ! -f "$INSTALL_DIR/.env" ]]; then
    p_err "Leksis does not appear to be installed at: ${INSTALL_DIR} (.env not found)"
    return 1
  fi

  # shellcheck source=/dev/null
  source "$INSTALL_DIR/.env"

  p_header "Edit Configuration"
  echo "  (press Enter to keep current value)"
  echo ""

  local new_model new_ocr new_rewrite new_keep new_spread new_max new_raw_host new_caddy_host new_nextauth_url new_pgver

  new_model=$(p_input      "Translation model"              "${OLLAMA_MODEL:-translategemma:27b}")
  new_ocr=$(p_input        "OCR model"                      "${OLLAMA_OCR_MODEL:-maternion/LightOnOCR-2}")
  new_rewrite=$(p_input    "Rewrite model"                  "${OLLAMA_REWRITE_MODEL:-qwen2.5:14b}")
  new_keep=$(p_input       "Keep alive"                     "${OLLAMA_KEEP_ALIVE:--1}")
  new_spread=$(p_input     "Sched spread"                   "${OLLAMA_SCHED_SPREAD:-false}")
  new_max=$(p_input        "Max loaded models"              "${OLLAMA_MAX_LOADED_MODELS:-3}")
  new_raw_host=$(p_input "Public URL host (domain or IP, no protocol)" \
    "$(echo "${NEXTAUTH_URL:-}" | sed 's|^https\?://||')")
  new_pgver=$(p_input    "PostgreSQL version"             "${POSTGRES_VERSION:-18}")

  # Derive CADDY_HOST and NEXTAUTH_URL from the raw host input
  local new_caddy_host new_nextauth_url
  if [[ "$new_raw_host" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    new_caddy_host=":80"
    new_nextauth_url="http://${new_raw_host}"
  else
    new_caddy_host="$new_raw_host"
    new_nextauth_url="https://${new_raw_host}"
  fi

  # Determine what changed
  local _changed_ollama=false _changed_app=false _changed_postgres=false
  [[ "$new_model"      != "${OLLAMA_MODEL:-}"             ]] && _changed_ollama=true
  [[ "$new_ocr"        != "${OLLAMA_OCR_MODEL:-}"         ]] && _changed_ollama=true
  [[ "$new_rewrite"    != "${OLLAMA_REWRITE_MODEL:-}"     ]] && _changed_ollama=true
  [[ "$new_keep"       != "${OLLAMA_KEEP_ALIVE:-}"        ]] && _changed_ollama=true
  [[ "$new_spread"     != "${OLLAMA_SCHED_SPREAD:-}"      ]] && _changed_ollama=true
  [[ "$new_max"        != "${OLLAMA_MAX_LOADED_MODELS:-}" ]] && _changed_ollama=true
  [[ "$new_caddy_host" != "${CADDY_HOST:-}"               ]] && _changed_app=true
  [[ "$new_pgver"      != "${POSTGRES_VERSION:-}"         ]] && _changed_postgres=true

  # Write values
  _env_set "OLLAMA_MODEL"             "$new_model"        "$INSTALL_DIR/.env"
  _env_set "OLLAMA_OCR_MODEL"         "$new_ocr"          "$INSTALL_DIR/.env"
  _env_set "OLLAMA_REWRITE_MODEL"     "$new_rewrite"      "$INSTALL_DIR/.env"
  _env_set "OLLAMA_KEEP_ALIVE"        "$new_keep"         "$INSTALL_DIR/.env"
  _env_set "OLLAMA_SCHED_SPREAD"      "$new_spread"       "$INSTALL_DIR/.env"
  _env_set "OLLAMA_MAX_LOADED_MODELS" "$new_max"          "$INSTALL_DIR/.env"
  _env_set "CADDY_HOST"               "$new_caddy_host"   "$INSTALL_DIR/.env"
  _env_set "NEXTAUTH_URL"             "$new_nextauth_url" "$INSTALL_DIR/.env"
  _env_set "POSTGRES_VERSION"         "$new_pgver"       "$INSTALL_DIR/.env"

  p_ok "Settings written to: ${INSTALL_DIR}/.env"

  cd "$INSTALL_DIR"
  detect_gpu
  resolve_compose_cmd

  if [[ "$_changed_ollama" == true ]]; then
    if p_yesno "Ollama configuration changed. Restart Ollama container now?" "y"; then
      p_info "Restarting Ollama..."
      $COMPOSE_CMD up -d ollama
      p_ok "Ollama restarted."
    fi
  fi

  if [[ "$_changed_app" == true ]]; then
    if p_yesno "App/Caddy configuration changed. Restart app and caddy now?" "y"; then
      p_info "Restarting app..."
      $COMPOSE_CMD up -d app
      p_info "Restarting caddy..."
      $COMPOSE_CMD up -d caddy
      p_ok "App and Caddy restarted."
    fi
  fi

  if [[ "$_changed_postgres" == true ]]; then
    echo ""
    p_warn "POSTGRES_VERSION updated to: ${new_pgver}"
    p_warn "WARNING: Changing the PostgreSQL major version on an existing installation"
    p_warn "requires a data migration (pg_upgrade or pg_dump / pg_restore) before"
    p_warn "restarting the postgres container."
    p_warn "The container has NOT been restarted automatically."
  fi
}

# ── Interactive menu (no argument) ────────────────────────────
show_menu() {
  while true; do
    p_header "Leksis v${VERSION} - Deployment Manager"
    echo "  1) install    Full installation on a fresh server"
    echo "  2) update     Update containers selectively"
    echo "  3) uninstall  Clean removal of all components"
    echo "  4) status     Live status of all services"
    echo "  5) config     Edit environment variables (.env)"
    echo "  6) logs       Tail service logs"
    echo "  0) exit"
    echo "------------------------------------------------------------"
    printf '  Choice: ' >/dev/tty
    local choice
    read -r choice </dev/tty
    case "$choice" in
      1|install)   cmd_install ;;
      2|update)    cmd_update ;;
      3|uninstall) cmd_uninstall ;;
      4|status)    cmd_status ;;
      5|config)    cmd_config ;;
      6|logs)      cmd_logs "" ;;
      0|exit|quit) echo ""; p_info "Goodbye."; echo ""; exit 0 ;;
      *) p_warn "Unknown option: ${choice}" ;;
    esac
  done
}

# ── Usage ─────────────────────────────────────────────────────
usage() {
  cat <<EOF
Usage: $0 [install|update|uninstall|status|config|logs [service]]

  install    Full guided installation on a fresh server
  update     Update one or more containers selectively
  uninstall  Clean removal of all Leksis components
  status     Show live status of all services
  config     Edit environment variables (.env)
  logs       Tail service logs (default: ask)

Run without arguments to open the interactive menu.
EOF
}

# ── Entry point ───────────────────────────────────────────────
main() {
  case "${1:-}" in
    -h|--help) usage; exit 0 ;;
  esac

  case "${1:-menu}" in
    install)   cmd_install ;;
    update)    cmd_update ;;
    uninstall) cmd_uninstall ;;
    status)    cmd_status ;;
    config)    cmd_config ;;
    logs)      cmd_logs "${2:-}" ;;
    menu)      show_menu ;;
    *)         printf 'ERROR: Unknown command: %s\n' "$1" >&2; usage; exit 1 ;;
  esac
}

main "$@"

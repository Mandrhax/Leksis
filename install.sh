#!/usr/bin/env bash
# ============================================================
# Leksis Deployment Script  (dialog TUI edition)
# Usage: ./install.sh [install|update|uninstall|status|config|logs]
#
# install    — Full guided installation on a fresh server
# update     — Update one or more containers selectively
# uninstall  — Clean removal of all Leksis components
# status     — Show live status of all services
# config     — Edit environment variables (.env)
# logs       — Tail logs of a service
#
# Run from a server via curl (stdin-safe):
#   bash <(curl -fsSL https://raw.githubusercontent.com/Mandrhax/Leksis/main/install.sh)
# ============================================================
set -euo pipefail

# ── Stdin guard ──────────────────────────────────────────────
# Interactive prompts require stdin to be a terminal.
# "curl url | bash" pipes stdin — use "bash <(curl url)" instead.
if [[ ! -t 0 ]]; then
  echo ""
  echo "ERROR: stdin is not a terminal — interactive prompts will not work."
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

# ── dialog globals (populated in main) ───────────────────────
DIALOG_TMP=""
BACKTITLE=""

# ── ensure_dialog ─────────────────────────────────────────────
# Installs `dialog` if not already available (apt / dnf / yum).
ensure_dialog() {
  command -v dialog &>/dev/null && return 0
  echo "Installing dialog TUI library..."
  if   command -v apt-get &>/dev/null; then apt-get install -y dialog >/dev/null 2>&1
  elif command -v dnf     &>/dev/null; then dnf     install -y dialog >/dev/null 2>&1
  elif command -v yum     &>/dev/null; then yum     install -y dialog >/dev/null 2>&1
  else
    echo "ERROR: Cannot install dialog — no supported package manager (apt/dnf/yum)." >&2
    exit 1
  fi
  echo "dialog installed."
}

# ── dialog wrappers ───────────────────────────────────────────

# d_input "title" "prompt" "default"  →  echoes value; exit 1 on Cancel
#
# </dev/tty >/dev/tty forces dialog to render on the real terminal even when
# called inside a command substitution $(...) — without this, ncurses can fail
# to initialise and the script appears to block.
d_input() {
  dialog --backtitle "$BACKTITLE" --title "$1" \
         --inputbox "$2" 0 74 "$3" \
         </dev/tty >/dev/tty 2>"$DIALOG_TMP" || return 1
  cat "$DIALOG_TMP"
}

# d_yesno "title" "message" "yes|no"  →  exit 0=Yes / 1=No or Cancel
d_yesno() {
  local _args=()
  [[ "${3:-yes}" == "no" ]] && _args+=("--defaultno")
  dialog --backtitle "$BACKTITLE" "${_args[@]}" --title "$1" \
         --yesno "$2" 0 74 \
         </dev/tty >/dev/tty
}

# d_password "title" "prompt"  →  echoes password; exit 1 on Cancel
d_password() {
  local _p1 _p2
  while true; do
    dialog --backtitle "$BACKTITLE" --title "$1" \
           --passwordbox "$2" 8 62 \
           </dev/tty >/dev/tty 2>"$DIALOG_TMP" || return 1
    _p1=$(cat "$DIALOG_TMP")
    if [[ -z "$_p1" ]]; then echo ""; return 0; fi
    dialog --backtitle "$BACKTITLE" --title "$1" \
           --passwordbox "Confirm password:" 8 62 \
           </dev/tty >/dev/tty 2>"$DIALOG_TMP" || return 1
    _p2=$(cat "$DIALOG_TMP")
    if [[ "$_p1" == "$_p2" ]]; then echo "$_p1"; return 0; fi
    d_msg "Error" "Passwords do not match. Try again."
  done
}

# d_msg "title" "message"  —  message box with OK button
d_msg() {
  dialog --backtitle "$BACKTITLE" --title "$1" \
         --msgbox "$2" 0 74 \
         </dev/tty >/dev/tty
}

# d_info "message"  —  non-blocking status (no button, auto-replaced by next dialog)
d_info() {
  dialog --backtitle "$BACKTITLE" --title "Please wait…" \
         --infobox "$1" 5 74 \
         </dev/tty >/dev/tty
}

# ── Validation helpers ────────────────────────────────────────
validate_url() {
  # Must start with http:// or https://, no trailing slash, no spaces
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
    d_msg "Permission Error" \
      "This script must be run as root (or with sudo).\n\nPlease re-run:\n  sudo ./install.sh"
    exit 1
  fi
}

# ── Dependency checks ─────────────────────────────────────────
check_deps() {
  local missing=()
  for dep in docker git openssl curl; do
    command -v "$dep" &>/dev/null || missing+=("$dep")
  done
  if ! docker compose version &>/dev/null 2>&1; then
    missing+=("docker-compose-plugin")
  fi
  if [[ ${#missing[@]} -gt 0 ]]; then
    d_msg "Missing Dependencies" \
      "The following will be installed automatically:\n\n  ${missing[*]}"
  fi
}

# ── Docker installation ───────────────────────────────────────
install_docker() {
  if command -v docker &>/dev/null && docker compose version &>/dev/null 2>&1; then
    d_info "Docker $(docker --version | cut -d' ' -f3 | tr -d ',') with Compose v2 already installed."
    sleep 1
    return 0
  fi

  d_info "Downloading Docker installer from get.docker.com..."
  curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
  (sh /tmp/get-docker.sh 2>&1) | \
    dialog --backtitle "$BACKTITLE" --title "Installing Docker" \
           --programbox "Installing Docker via get.docker.com — please wait" 25 82
  rm -f /tmp/get-docker.sh

  systemctl enable docker 2>/dev/null || true
  systemctl start  docker 2>/dev/null || true
  sleep 3

  if ! docker compose version &>/dev/null 2>&1; then
    d_info "Installing docker-compose-plugin..."
    $PKG_INSTALL docker-compose-plugin >/dev/null 2>&1 || \
      $PKG_INSTALL docker-compose      >/dev/null 2>&1 || true
    sleep 2
  fi

  if ! docker compose version &>/dev/null 2>&1; then
    d_msg "Error" \
      "Docker Compose v2 could not be installed.\nPlease install it manually and re-run."
    exit 1
  fi
}

# ── GPU detection (multi-vendor) ──────────────────────────────
GPU_VENDOR=""
GPU_NAME=""

detect_gpu() {
  GPU_VENDOR=""
  GPU_NAME=""

  if command -v lspci &>/dev/null; then
    local line
    line=$(lspci | grep -iE "vga|3d controller|display controller" | head -1 || true)
    if   echo "$line" | grep -qi "nvidia";                      then GPU_VENDOR="nvidia"
    elif echo "$line" | grep -qi "amd\|radeon\|advanced micro"; then GPU_VENDOR="amd"
    elif echo "$line" | grep -qi "intel";                       then GPU_VENDOR="intel"
    fi
    GPU_NAME=$(echo "$line" | sed 's/.*: //')
  fi

  if [[ -z "$GPU_VENDOR" ]]; then
    if command -v nvidia-smi &>/dev/null \
        && nvidia-smi --query-gpu=name --format=csv,noheader &>/dev/null 2>&1; then
      GPU_VENDOR="nvidia"
      GPU_NAME=$(nvidia-smi --query-gpu=name --format=csv,noheader | head -1 || true)
    elif command -v rocm-smi &>/dev/null; then
      GPU_VENDOR="amd"
    fi
  fi

  # Intel GPU: experimental SYCL only — fall back to CPU
  if [[ "$GPU_VENDOR" == "intel" ]]; then
    GPU_VENDOR=""
    GPU_NAME=""
  fi
}

# ── GPU toolkit installation ──────────────────────────────────

# NVIDIA kernel driver — version pinned for legacy GPU compatibility
NVIDIA_DRIVER_VERSION="580.142"
NVIDIA_DRIVER_URL="https://us.download.nvidia.com/XFree86/Linux-x86_64/${NVIDIA_DRIVER_VERSION}/NVIDIA-Linux-x86_64-${NVIDIA_DRIVER_VERSION}.run"
NVIDIA_DRIVER_RUN="/tmp/NVIDIA-Linux-x86_64-${NVIDIA_DRIVER_VERSION}.run"

_install_nvidia_driver() {
  if command -v nvidia-smi &>/dev/null; then
    local installed_ver
    installed_ver=$(nvidia-smi --query-gpu=driver_version --format=csv,noheader 2>/dev/null | head -1 || true)
    if [[ -n "$installed_ver" ]]; then
      d_info "NVIDIA driver ${installed_ver} already installed."
      sleep 1
      return 0
    fi
  fi

  d_info "Installing kernel build dependencies..."
  apt-get install -y \
    build-essential dkms "linux-headers-$(uname -r)" \
    pkg-config libglvnd-dev >/dev/null 2>&1

  local nouveau_conf="/etc/modprobe.d/blacklist-nouveau.conf"
  if [[ ! -f "$nouveau_conf" ]]; then
    tee "$nouveau_conf" >/dev/null <<'EOF'
blacklist nouveau
options nouveau modeset=0
EOF
    update-initramfs -u >/dev/null 2>&1 || true
  fi

  if lsmod | grep -q "^nouveau "; then
    d_msg "Reboot Required" \
      "The nouveau driver is currently active.\n\n\
The system must be rebooted before NVIDIA drivers can be installed.\n\n\
Please reboot and re-run install.sh:\n\
  sudo reboot\n\
  sudo ./install.sh"
    exit 0
  fi

  if [[ ! -f "$NVIDIA_DRIVER_RUN" ]]; then
    d_info "Downloading NVIDIA driver ${NVIDIA_DRIVER_VERSION}..."
    curl -fL "$NVIDIA_DRIVER_URL" -o "$NVIDIA_DRIVER_RUN" 2>&1 | \
      dialog --backtitle "$BACKTITLE" --title "Downloading NVIDIA Driver ${NVIDIA_DRIVER_VERSION}" \
             --programbox "Downloading..." 10 82 || true
  fi
  chmod +x "$NVIDIA_DRIVER_RUN"

  ("$NVIDIA_DRIVER_RUN" --silent --dkms --no-questions 2>&1) | \
    dialog --backtitle "$BACKTITLE" \
           --title "Installing NVIDIA Driver ${NVIDIA_DRIVER_VERSION}" \
           --programbox "Installing via .run installer — this may take several minutes" 22 82
}

_install_nvidia_toolkit() {
  if docker info 2>/dev/null | grep -q "nvidia"; then
    d_info "nvidia-container-toolkit already configured."
    sleep 1
    return 0
  fi

  (
    curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
      | gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
    curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
      | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
      | tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
    apt-get update -qq
    apt-get install -y nvidia-container-toolkit
    nvidia-ctk runtime configure --runtime=docker
    systemctl restart docker
  ) 2>&1 | \
    dialog --backtitle "$BACKTITLE" --title "Installing nvidia-container-toolkit" \
           --programbox "Configuring NVIDIA container runtime..." 22 82
}

_install_amd_rocm() {
  if docker info 2>/dev/null | grep -q "rocm\|amdgpu"; then
    d_info "ROCm already configured."
    sleep 1
    return 0
  fi
  local codename
  codename=$(. /etc/os-release 2>/dev/null && echo "${UBUNTU_CODENAME:-jammy}")
  (
    curl -fsSL \
      "https://repo.radeon.com/amdgpu-install/latest/ubuntu/${codename}/amdgpu-install_6.3.60300-1_all.deb" \
      -o /tmp/amdgpu-install.deb
    $PKG_INSTALL /tmp/amdgpu-install.deb
    amdgpu-install -y --usecase=rocm --no-dkms
    usermod -aG render,video root
  ) 2>&1 | \
    dialog --backtitle "$BACKTITLE" --title "Installing AMD ROCm" \
           --programbox "Installing ROCm toolkit..." 22 82
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
  d_info "Creating PostgreSQL backup...\n${backup_file}"
  if docker compose -f "${install_dir}/docker-compose.yml" exec -T postgres \
      pg_dump -U leksis_user leksis > "$backup_file" 2>/dev/null; then
    d_msg "Backup Created" "Backup saved to:\n\n  ${backup_file}"
  else
    d_msg "Backup Warning" \
      "PostgreSQL backup failed (container may be offline).\nContinuing without backup."
    rm -f "$backup_file"
  fi
}

pull_model_if_needed() {
  local model="$1"
  if $COMPOSE_CMD exec -T ollama ollama list 2>/dev/null | grep -q "^${model}"; then
    d_info "Model already present: ${model}"
    sleep 1
  else
    ($COMPOSE_CMD exec -T ollama ollama pull "$model" 2>&1) | \
      dialog --backtitle "$BACKTITLE" \
             --title "Pulling model: ${model}" \
             --programbox "Downloading model from Ollama hub — press OK when done" 22 82
  fi
}

wait_healthy() {
  local service="$1"
  local max_wait="${2:-180}"
  local elapsed=0
  while [[ $elapsed -lt $max_wait ]]; do
    dialog --backtitle "$BACKTITLE" --title "Please wait…" \
           --infobox "Waiting for ${service} to be healthy...\n(${elapsed}s / ${max_wait}s)" 5 62
    local status
    status=$(docker inspect --format='{{.State.Health.Status}}' \
             "leksis-${service}" 2>/dev/null || echo "")
    if [[ "$status" == "healthy" ]]; then return 0; fi
    sleep 5
    elapsed=$((elapsed + 5))
  done
  d_msg "Service Timeout" \
    "${service} did not become healthy within ${max_wait}s.\n\nCheck logs:\n  docker compose logs ${service}"
  return 1
}

show_volumes_info() {
  local install_dir="$1"
  for vol in leksis_postgres_data leksis_ollama_data; do
    local mountpoint
    mountpoint=$(docker volume inspect "$vol" --format='{{.Mountpoint}}' 2>/dev/null || echo "")
    if [[ -n "$mountpoint" ]]; then
      printf "  %-32s  %s\n" "$vol" "$(du -sh "$mountpoint" 2>/dev/null | cut -f1 || echo '?')"
    else
      printf "  %-32s  %s\n" "$vol" "(not found)"
    fi
  done
}

# ── Env file helper ───────────────────────────────────────────
_env_set() {
  # _env_set KEY VALUE /path/to/.env  (uses | as delimiter — URLs safe)
  local key="$1" value="$2" envfile="$3"
  sed -i "s|^${key}=.*|${key}=${value}|" "$envfile"
}

# ── Mode: install ─────────────────────────────────────────────
cmd_install() {
  check_root
  detect_pkg_manager

  # ── System requirements ────────────────────────────────────
  d_info "Checking system requirements..."
  check_deps
  d_info "Setting up Docker..."
  install_docker
  d_info "Detecting GPU..."
  detect_gpu

  local _gpu_label="CPU-only mode"
  case "${GPU_VENDOR:-}" in
    nvidia) _gpu_label="NVIDIA GPU${GPU_NAME:+: ${GPU_NAME}}" ;;
    amd)    _gpu_label="AMD GPU${GPU_NAME:+: ${GPU_NAME}}" ;;
  esac
  d_info "GPU: ${_gpu_label}\nInstalling GPU toolkit if needed..."
  install_gpu_toolkit
  resolve_compose_cmd

  # ── Form 1/5 — Installation paths ─────────────────────────
  local INSTALL_DIR REPO_URL
  if ! dialog --backtitle "$BACKTITLE" \
    --title "Configuration — 1/5: Installation Paths" \
    --form "" 10 78 2 \
    "Install directory:" 1 1 "/opt/leksis"                            1 22 52 255 \
    "Repository URL:"    2 1 "https://github.com/Mandrhax/Leksis.git" 2 22 52 255 \
    2>"$DIALOG_TMP"; then
    d_msg "Cancelled" "Installation aborted."; return 0
  fi
  mapfile -t _f < "$DIALOG_TMP"
  INSTALL_DIR="${_f[0]}"
  REPO_URL="${_f[1]}"

  # ── Form 2/5 — Application URL ─────────────────────────────
  local APP_URL="" PROTO="http" APP_DOMAIN APP_PORT="3000"
  APP_DOMAIN=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "127.0.0.1")

  while true; do
    if ! dialog --backtitle "$BACKTITLE" \
      --title "Configuration — 2/5: Application URL" \
      --form "URL used to access Leksis from a browser." 11 78 3 \
      "Protocol (http / https):" 1 1 "$PROTO"       1 28 12  0 \
      "Domain or IP address:"    2 1 "$APP_DOMAIN"  2 28 44  0 \
      "Exposed port:"            3 1 "$APP_PORT"    3 28 10  0 \
      2>"$DIALOG_TMP"; then
      d_msg "Cancelled" "Installation aborted."; return 0
    fi
    mapfile -t _f < "$DIALOG_TMP"
    PROTO="${_f[0]}"; APP_DOMAIN="${_f[1]}"; APP_PORT="${_f[2]}"
    APP_URL="${PROTO}://${APP_DOMAIN}:${APP_PORT}"
    validate_url "$APP_URL" && break
    d_msg "Invalid URL" \
      "Invalid URL: ${APP_URL}\n\nMust start with http:// or https:// and have no trailing slash.\nExample: http://192.168.1.10:3000"
  done

  # ── Form 3/5 — Admin account ───────────────────────────────
  local ADMIN_EMAIL="" ADMIN_NAME="Admin"
  while true; do
    if ! dialog --backtitle "$BACKTITLE" \
      --title "Configuration — 3/5: Admin Account" \
      --form "Leave email empty to skip admin user creation." 10 78 2 \
      "Admin email (optional):" 1 1 ""       1 28 44 0 \
      "Admin display name:"     2 1 "Admin"  2 28 30 0 \
      2>"$DIALOG_TMP"; then
      d_msg "Cancelled" "Installation aborted."; return 0
    fi
    mapfile -t _f < "$DIALOG_TMP"
    ADMIN_EMAIL="${_f[0]}"
    ADMIN_NAME="${_f[1]:-Admin}"
    if [[ -z "$ADMIN_EMAIL" ]] || validate_email "$ADMIN_EMAIL"; then break; fi
    d_msg "Invalid Email" \
      "Invalid email address: ${ADMIN_EMAIL}\n\nPlease enter a valid email or leave it empty."
  done

  # ── Form 4/5 — Ollama models ───────────────────────────────
  local OLLAMA_MODEL OLLAMA_OCR_MODEL OLLAMA_REWRITE_MODEL
  if ! dialog --backtitle "$BACKTITLE" \
    --title "Configuration — 4/5: Ollama Models" \
    --form "Models pulled from the Ollama hub on first start." 12 78 3 \
    "Translation model:" 1 1 "translategemma:27b"     1 22 52 0 \
    "OCR model:"         2 1 "maternion/LightOnOCR-2" 2 22 52 0 \
    "Rewrite model:"     3 1 "qwen2.5:14b"            3 22 52 0 \
    2>"$DIALOG_TMP"; then
    d_msg "Cancelled" "Installation aborted."; return 0
  fi
  mapfile -t _f < "$DIALOG_TMP"
  OLLAMA_MODEL="${_f[0]}"
  OLLAMA_OCR_MODEL="${_f[1]}"
  OLLAMA_REWRITE_MODEL="${_f[2]}"

  # ── Form 5/5 — Ollama runtime ──────────────────────────────
  local OLLAMA_KEEP_ALIVE OLLAMA_SCHED_SPREAD OLLAMA_MAX_LOADED_MODELS
  if ! dialog --backtitle "$BACKTITLE" \
    --title "Configuration — 5/5: Ollama Runtime" \
    --form "" 11 78 3 \
    "Keep alive  (-1=forever, 5m=5 min, 0=unload):" 1 1 "-1"    1 50 10 0 \
    "GPU scheduling spread             (true/false):" 2 1 "false" 2 50 10 0 \
    "Max models loaded in VRAM                (int):" 3 1 "3"     3 50 5  0 \
    2>"$DIALOG_TMP"; then
    d_msg "Cancelled" "Installation aborted."; return 0
  fi
  mapfile -t _f < "$DIALOG_TMP"
  OLLAMA_KEEP_ALIVE="${_f[0]}"
  OLLAMA_SCHED_SPREAD="${_f[1]}"
  OLLAMA_MAX_LOADED_MODELS="${_f[2]}"

  # ── PostgreSQL password ────────────────────────────────────
  local POSTGRES_PASSWORD
  POSTGRES_PASSWORD=$(d_password "PostgreSQL Password" \
    "Enter DB password (leave empty to auto-generate):") || {
    d_msg "Cancelled" "Installation aborted."; return 0
  }
  if [[ -z "$POSTGRES_PASSWORD" ]]; then
    POSTGRES_PASSWORD=$(openssl rand -hex 16)
    d_info "Auto-generating PostgreSQL password..."; sleep 1
  fi

  # ── Secrets ────────────────────────────────────────────────
  d_info "Generating AUTH_SECRET and ENCRYPTION_KEY..."; sleep 1
  local AUTH_SECRET ENCRYPTION_KEY
  AUTH_SECRET=$(openssl rand -base64 32)
  ENCRYPTION_KEY=$(openssl rand -hex 32)

  # ── Clone / update repository ──────────────────────────────
  if [[ -d "$INSTALL_DIR/.git" ]]; then
    local BRANCH; BRANCH=$(detect_branch "$INSTALL_DIR")
    (git -C "$INSTALL_DIR" pull origin "$BRANCH" 2>&1) | \
      dialog --backtitle "$BACKTITLE" --title "Updating Repository" \
             --programbox "Pulling latest changes (branch: ${BRANCH})..." 15 78 || true
  elif [[ -d "$INSTALL_DIR" ]]; then
    if d_yesno "Directory Exists" \
      "${INSTALL_DIR} exists but is not a git repository.\n\nEmpty it and clone fresh?" "no"; then
      cd /tmp
      rm -rf "$INSTALL_DIR"
      (git clone "$REPO_URL" "$INSTALL_DIR" 2>&1) | \
        dialog --backtitle "$BACKTITLE" --title "Cloning Repository" \
               --programbox "Cloning from GitHub..." 15 78
    else
      d_msg "Cancelled" "Installation aborted."; return 0
    fi
  else
    (git clone "$REPO_URL" "$INSTALL_DIR" 2>&1) | \
      dialog --backtitle "$BACKTITLE" --title "Cloning Repository" \
             --programbox "Cloning from GitHub..." 15 78
  fi

  # ── Build .env ─────────────────────────────────────────────
  local ENV_CONTENT
  ENV_CONTENT=$(cat <<EOF
# Generated by install.sh on $(date -u +"%Y-%m-%dT%H:%M:%SZ")

POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
DATABASE_URL=postgresql://leksis_user:${POSTGRES_PASSWORD}@postgres:5432/leksis
AUTH_SECRET=${AUTH_SECRET}
NEXTAUTH_URL=${APP_URL}
ENCRYPTION_KEY=${ENCRYPTION_KEY}
APP_PORT=${APP_PORT}
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

  # ── .env preview (secrets masked) ─────────────────────────
  local _tmp_prev; _tmp_prev=$(mktemp)
  while IFS= read -r line; do
    if printf '%s' "$line" | grep -qE \
        "^(POSTGRES_PASSWORD|AUTH_SECRET|ENCRYPTION_KEY|DATABASE_URL)="; then
      printf '%s=****\n' "${line%%=*}"
    else
      printf '%s\n' "$line"
    fi
  done <<< "$ENV_CONTENT" > "$_tmp_prev"
  dialog --backtitle "$BACKTITLE" --title ".env Preview (secrets masked)" \
         --textbox "$_tmp_prev" 28 78
  rm -f "$_tmp_prev"

  if ! d_yesno "Write .env" \
    "Write this configuration to ${INSTALL_DIR}/.env ?" "yes"; then
    d_msg "Cancelled" "Installation aborted."; return 0
  fi
  printf '%s\n' "$ENV_CONTENT" > "$INSTALL_DIR/.env"
  chmod 600 "$INSTALL_DIR/.env"

  # ── Port availability check ────────────────────────────────
  for port in "$APP_PORT" "11434"; do
    if ss -tlnp 2>/dev/null | grep -q ":${port} " || \
       netstat -tlnp 2>/dev/null | grep -q ":${port} "; then
      d_yesno "Port in Use" \
        "Port ${port} appears to be already in use.\n\nContinue anyway?" "no" || {
        d_msg "Cancelled" "Installation aborted."; return 0
      }
    fi
  done

  # ── Start containers ───────────────────────────────────────
  cd "$INSTALL_DIR"
  if d_yesno "Build App Image" \
    "Rebuild the app Docker image from source?\n\n(Recommended for a first install)" "yes"; then
    (BUILDKIT_PROGRESS=plain $COMPOSE_CMD up -d --build 2>&1) | \
      dialog --backtitle "$BACKTITLE" --title "Building Docker Image" \
             --programbox "Building app image — this may take several minutes" 32 82
  else
    ($COMPOSE_CMD up -d 2>&1) | \
      dialog --backtitle "$BACKTITLE" --title "Starting Containers" \
             --programbox "Starting services..." 15 78
  fi

  # ── Wait for healthy ───────────────────────────────────────
  wait_healthy postgres 120
  wait_healthy ollama   120
  wait_healthy app      180

  # ── Pull Ollama models ─────────────────────────────────────
  pull_model_if_needed "$OLLAMA_MODEL"
  pull_model_if_needed "$OLLAMA_OCR_MODEL"
  pull_model_if_needed "$OLLAMA_REWRITE_MODEL"

  # ── Pre-warm models into VRAM ──────────────────────────────
  d_info "Pre-warming models into VRAM (this may take a few minutes)..."
  for _m in "$OLLAMA_MODEL" "$OLLAMA_OCR_MODEL" "$OLLAMA_REWRITE_MODEL"; do
    curl -s --max-time 120 -X POST "http://localhost:11434/api/generate" \
      -d "{\"model\":\"${_m}\",\"prompt\":\"\",\"stream\":false,\"keep_alive\":-1}" \
      > /dev/null 2>&1 || true
  done

  # ── Create admin user ──────────────────────────────────────
  if [[ -n "$ADMIN_EMAIL" ]]; then
    d_info "Creating admin user: ${ADMIN_EMAIL}..."
    local _email _name
    _email=$(printf '%s' "$ADMIN_EMAIL" | sed "s/'/''/g")
    _name=$(printf  '%s' "$ADMIN_NAME"  | sed "s/'/''/g")
    $COMPOSE_CMD exec -T postgres \
      psql -U leksis_user -d leksis \
      -c "INSERT INTO users (email, name, role) VALUES ('${_email}', '${_name}', 'admin')
          ON CONFLICT (email) DO UPDATE SET role = 'admin', name = '${_name}';" \
      2>/dev/null || true
    sleep 1
  fi

  # ── Summary ────────────────────────────────────────────────
  local _gpu_summary="${GPU_VENDOR:-CPU}${GPU_NAME:+ — ${GPU_NAME}}"
  d_msg "Installation Complete!" "\
Leksis has been successfully deployed.

  App URL       : ${APP_URL}
  Admin         : ${ADMIN_EMAIL:-not set}
  Install dir   : ${INSTALL_DIR}
  GPU           : ${_gpu_summary}
  Ollama image  : ${OLLAMA_IMAGE}

Useful commands:
  ./install.sh status  — show service status
  ./install.sh logs    — tail app logs
  ./install.sh config  — edit configuration"
}

# ── Mode: update ──────────────────────────────────────────────
cmd_update() {
  check_root

  local INSTALL_DIR
  INSTALL_DIR=$(d_input "Update" "Installation directory:" "/opt/leksis") || {
    d_msg "Cancelled" "Update aborted."; return 0
  }

  if [[ ! -f "$INSTALL_DIR/.env" ]]; then
    d_msg "Not Found" \
      "Leksis does not appear to be installed at:\n${INSTALL_DIR}\n\n(.env not found)"
    return 1
  fi

  # shellcheck source=/dev/null
  source "$INSTALL_DIR/.env"

  # Show current status
  local _tmp_st; _tmp_st=$(mktemp)
  docker compose -f "$INSTALL_DIR/docker-compose.yml" ps 2>/dev/null > "$_tmp_st" || true
  dialog --backtitle "$BACKTITLE" --title "Current Container Status" \
         --textbox "$_tmp_st" 18 82
  rm -f "$_tmp_st"

  # Backup before changes
  pg_backup "$INSTALL_DIR"

  # Pull latest sources
  local BRANCH; BRANCH=$(detect_branch "$INSTALL_DIR")
  (git -C "$INSTALL_DIR" pull origin "$BRANCH" 2>&1) | \
    dialog --backtitle "$BACKTITLE" --title "Updating Sources" \
           --programbox "Pulling branch: ${BRANCH}..." 15 78

  detect_gpu
  resolve_compose_cmd

  # Select components
  if ! dialog --backtitle "$BACKTITLE" \
    --title "Update — Select Components" \
    --checklist "SPACE to toggle, ENTER to confirm:" 13 62 5 \
    "app"      "Application container"           "on"  \
    "postgres" "PostgreSQL container"            "off" \
    "ollama"   "Ollama container"                "off" \
    "models"   "Ollama models only (no restart)" "off" \
    2>"$DIALOG_TMP"; then
    d_msg "Cancelled" "Update aborted."; return 0
  fi

  # Parse checklist output  →  "app" "models"  →  app models
  local _raw; _raw=$(tr -d '"' < "$DIALOG_TMP")
  local selected=()
  IFS=' ' read -ra selected <<< "$_raw"

  if [[ ${#selected[@]} -eq 0 ]]; then
    d_msg "Nothing Selected" "No components were selected. Update cancelled."; return 0
  fi

  cd "$INSTALL_DIR"

  _update_service() {
    local svc="$1"
    (BUILDKIT_PROGRESS=plain $COMPOSE_CMD up -d --build "$svc" 2>&1) | \
      dialog --backtitle "$BACKTITLE" --title "Updating: ${svc}" \
             --programbox "Rebuilding and restarting ${svc}..." 28 82
    wait_healthy "$svc" 180
  }

  _update_models() {
    pull_model_if_needed "${OLLAMA_MODEL:-translategemma:27b}"
    pull_model_if_needed "${OLLAMA_OCR_MODEL:-maternion/LightOnOCR-2}"
    pull_model_if_needed "${OLLAMA_REWRITE_MODEL:-qwen2.5:14b}"
  }

  for comp in "${selected[@]}"; do
    case "$comp" in
      app|postgres|ollama) _update_service "$comp" ;;
      models)              _update_models ;;
    esac
  done

  d_msg "Update Complete" \
    "Selected components have been updated.\n\nVolumes (postgres_data, ollama_data) preserved."
}

# ── Mode: uninstall ───────────────────────────────────────────
cmd_uninstall() {
  check_root

  local INSTALL_DIR
  INSTALL_DIR=$(d_input "Uninstall" "Installation directory:" "/opt/leksis") || {
    d_msg "Cancelled" "Uninstall aborted."; return 0
  }

  if [[ ! -f "$INSTALL_DIR/.env" ]]; then
    d_msg "Not Found" \
      "Leksis does not appear to be installed at:\n${INSTALL_DIR}\n\n(.env not found)"
    return 1
  fi

  # Volume info
  local _vol_info; _vol_info=$(show_volumes_info "$INSTALL_DIR" 2>/dev/null || echo "  (unavailable)")
  d_msg "Volume Disk Usage" "Current data volumes:\n\n${_vol_info}"

  # Optional pre-uninstall backup
  if d_yesno "Pre-Uninstall Backup" \
    "Create a PostgreSQL backup before removal?" "yes"; then
    pg_backup "$INSTALL_DIR"
  fi

  # Keep volumes?
  local KEEP_DATA=false
  if d_yesno "Keep Data?" \
    "Keep PostgreSQL data and Ollama models?\n\nYes = Docker volumes preserved\nNo  = ALL data permanently deleted" "no"; then
    KEEP_DATA=true
  fi

  # Final typed confirmation
  local _confirm
  _confirm=$(d_input "DANGER — Confirm Uninstall" \
    "This will remove:\n• Containers: leksis-app, leksis-postgres, leksis-ollama\n• Image: leksis-app\n• Directory: ${INSTALL_DIR}\n\nType DELETE to confirm:" "") || true
  if [[ "$_confirm" != "DELETE" ]]; then
    d_msg "Cancelled" "Uninstall cancelled — no changes made."; return 0
  fi

  cd "$INSTALL_DIR" 2>/dev/null || true

  d_info "Stopping and removing containers..."
  if [[ "$KEEP_DATA" == "true" ]]; then
    docker compose down 2>/dev/null || true
  else
    docker compose down -v 2>/dev/null || true
  fi

  if d_yesno "Remove Ollama Image?" \
    "Also remove the Ollama Docker image?\n(may free 5–10 GB)" "no"; then
    docker image rm ollama/ollama:latest ollama/ollama:rocm 2>/dev/null || true
  fi

  d_info "Removing local image and installation directory..."
  docker image rm leksis-app 2>/dev/null || true
  cd /
  rm -rf "$INSTALL_DIR"

  local _msg="Leksis has been completely removed."
  if [[ "$KEEP_DATA" == "true" ]]; then
    _msg+="\n\nVolumes were preserved. To remove them:\n  docker volume rm leksis_postgres_data leksis_ollama_data"
  fi
  d_msg "Uninstall Complete" "$_msg"
}

# ── Mode: status ──────────────────────────────────────────────
cmd_status() {
  local INSTALL_DIR
  INSTALL_DIR=$(d_input "Status" "Installation directory:" "/opt/leksis") || return 0

  if [[ -f "$INSTALL_DIR/.env" ]]; then
    # shellcheck source=/dev/null
    source "$INSTALL_DIR/.env"
  fi

  d_info "Gathering service status..."
  detect_gpu

  local _tmp_st; _tmp_st=$(mktemp)
  {
    echo "=== Leksis v${VERSION} — Service Status ==="
    echo ""
    echo "=== Containers ==="
    docker compose -f "$INSTALL_DIR/docker-compose.yml" ps 2>/dev/null \
      || echo "  (unavailable)"
    echo ""
    echo "=== GPU ==="
    case "${GPU_VENDOR:-}" in
      nvidia) echo "  NVIDIA GPU: ${GPU_NAME}" ;;
      amd)    echo "  AMD GPU: ${GPU_NAME}" ;;
      *)      echo "  No GPU detected — CPU-only mode" ;;
    esac
    echo ""
    echo "=== Ollama Models ==="
    docker compose -f "$INSTALL_DIR/docker-compose.yml" \
      exec -T ollama ollama list 2>/dev/null \
      || echo "  (Ollama container may still be starting)"
    echo ""
    echo "=== Disk Usage (volumes) ==="
    show_volumes_info "$INSTALL_DIR" 2>/dev/null || echo "  (unavailable)"
    echo ""
    echo "=== Recent App Logs (last 20 lines) ==="
    docker compose -f "$INSTALL_DIR/docker-compose.yml" \
      logs --tail=20 app 2>/dev/null \
      || echo "  (unavailable)"
  } > "$_tmp_st" 2>&1

  dialog --backtitle "$BACKTITLE" --title "Leksis Status" \
         --textbox "$_tmp_st" 40 84
  rm -f "$_tmp_st"
}

# ── Mode: logs ────────────────────────────────────────────────
cmd_logs() {
  local service="${1:-}"

  local INSTALL_DIR
  INSTALL_DIR=$(d_input "Logs" "Installation directory:" "/opt/leksis") || return 0

  # If service not given via CLI, ask via menu
  if [[ -z "$service" ]]; then
    if ! dialog --backtitle "$BACKTITLE" \
      --title "Select Service" \
      --menu "Which service logs to stream?" 10 52 3 \
      "app"      "Leksis application" \
      "postgres" "PostgreSQL database" \
      "ollama"   "Ollama AI server" \
      2>"$DIALOG_TMP"; then
      return 0
    fi
    service=$(cat "$DIALOG_TMP")
  fi

  docker compose -f "$INSTALL_DIR/docker-compose.yml" logs -f "$service" 2>&1 | \
    dialog --backtitle "$BACKTITLE" \
           --title "Logs — ${service}  (Ctrl+C to stop)" \
           --programbox "Streaming live logs from ${service}..." 40 84
}

# ── Mode: config ──────────────────────────────────────────────
cmd_config() {
  check_root

  local INSTALL_DIR
  INSTALL_DIR=$(d_input "Configuration" "Installation directory:" "/opt/leksis") || {
    d_msg "Cancelled" "Configuration aborted."; return 0
  }

  if [[ ! -f "$INSTALL_DIR/.env" ]]; then
    d_msg "Not Found" \
      "Leksis does not appear to be installed at:\n${INSTALL_DIR}\n\n(.env not found)"
    return 1
  fi

  # shellcheck source=/dev/null
  source "$INSTALL_DIR/.env"

  if ! dialog --backtitle "$BACKTITLE" \
    --title "Configuration Editor" \
    --form "Tab to navigate between fields." 22 80 8 \
    "Translation model:"    1 1 "${OLLAMA_MODEL:-translategemma:27b}"           1 26 48 0 \
    "OCR model:"            2 1 "${OLLAMA_OCR_MODEL:-maternion/LightOnOCR-2}"   2 26 48 0 \
    "Rewrite model:"        3 1 "${OLLAMA_REWRITE_MODEL:-qwen2.5:14b}"          3 26 48 0 \
    "Keep alive:"           4 1 "${OLLAMA_KEEP_ALIVE:--1}"                      4 26 15 0 \
    "Sched spread:"         5 1 "${OLLAMA_SCHED_SPREAD:-false}"                 5 26 10 0 \
    "Max loaded models:"    6 1 "${OLLAMA_MAX_LOADED_MODELS:-3}"                6 26 5  0 \
    "Public URL:"           7 1 "${NEXTAUTH_URL:-}"                             7 26 48 0 \
    "App port:"             8 1 "${APP_PORT:-3000}"                             8 26 10 0 \
    2>"$DIALOG_TMP"; then
    d_msg "Cancelled" "Configuration not saved."; return 0
  fi

  mapfile -t _f < "$DIALOG_TMP"
  local new_model="${_f[0]}"    new_ocr="${_f[1]}"     new_rewrite="${_f[2]}"
  local new_keep="${_f[3]}"     new_spread="${_f[4]}"  new_max="${_f[5]}"
  local new_url="${_f[6]}"      new_port="${_f[7]}"

  # Validate URL if changed
  if [[ -n "$new_url" ]] && ! validate_url "$new_url"; then
    d_msg "Invalid URL" \
      "The public URL is invalid:\n${new_url}\n\nMust start with http:// or https://, no trailing slash.\n\nNo changes were saved."
    return 1
  fi

  # Determine what changed
  local _changed_ollama=false _changed_app=false
  [[ "$new_model"   != "${OLLAMA_MODEL:-}"              ]] && _changed_ollama=true
  [[ "$new_ocr"     != "${OLLAMA_OCR_MODEL:-}"          ]] && _changed_ollama=true
  [[ "$new_rewrite" != "${OLLAMA_REWRITE_MODEL:-}"      ]] && _changed_ollama=true
  [[ "$new_keep"    != "${OLLAMA_KEEP_ALIVE:-}"         ]] && _changed_ollama=true
  [[ "$new_spread"  != "${OLLAMA_SCHED_SPREAD:-}"       ]] && _changed_ollama=true
  [[ "$new_max"     != "${OLLAMA_MAX_LOADED_MODELS:-}"  ]] && _changed_ollama=true
  [[ "$new_url"     != "${NEXTAUTH_URL:-}"              ]] && _changed_app=true
  [[ "$new_port"    != "${APP_PORT:-}"                  ]] && _changed_app=true

  # Write all changed values
  _env_set "OLLAMA_MODEL"             "$new_model"    "$INSTALL_DIR/.env"
  _env_set "OLLAMA_OCR_MODEL"         "$new_ocr"      "$INSTALL_DIR/.env"
  _env_set "OLLAMA_REWRITE_MODEL"     "$new_rewrite"  "$INSTALL_DIR/.env"
  _env_set "OLLAMA_KEEP_ALIVE"        "$new_keep"     "$INSTALL_DIR/.env"
  _env_set "OLLAMA_SCHED_SPREAD"      "$new_spread"   "$INSTALL_DIR/.env"
  _env_set "OLLAMA_MAX_LOADED_MODELS" "$new_max"      "$INSTALL_DIR/.env"
  _env_set "NEXTAUTH_URL"             "$new_url"      "$INSTALL_DIR/.env"
  _env_set "APP_PORT"                 "$new_port"     "$INSTALL_DIR/.env"

  cd "$INSTALL_DIR"
  detect_gpu
  resolve_compose_cmd

  if [[ "$_changed_ollama" == true ]]; then
    d_yesno "Restart Ollama?" \
      "Ollama configuration changed.\n\nRecreate the Ollama container to apply changes?" "yes" && \
      ($COMPOSE_CMD up -d ollama 2>&1 | \
        dialog --backtitle "$BACKTITLE" --title "Restarting Ollama" \
               --programbox "Applying new configuration..." 12 72) || true
  fi

  if [[ "$_changed_app" == true ]]; then
    d_yesno "Restart App?" \
      "Application configuration changed.\n\nRecreate the app container to apply changes?" "yes" && \
      ($COMPOSE_CMD up -d app 2>&1 | \
        dialog --backtitle "$BACKTITLE" --title "Restarting App" \
               --programbox "Applying new configuration..." 12 72) || true
  fi

  d_msg "Configuration Saved" "Settings written to:\n\n  ${INSTALL_DIR}/.env"
}

# ── Interactive menu (no argument) ────────────────────────────
show_menu() {
  while true; do
    if ! dialog --backtitle "$BACKTITLE" \
      --title "Leksis — Deployment Manager" \
      --menu "Select an option:" 15 68 6 \
      "install"   "Full installation on a fresh server" \
      "update"    "Update containers selectively" \
      "uninstall" "Clean removal of all components" \
      "status"    "Live status of all services" \
      "config"    "Edit environment variables (.env)" \
      "logs"      "Tail service logs" \
      2>"$DIALOG_TMP"; then
      # User pressed Cancel / Escape
      clear; exit 0
    fi

    local _choice; _choice=$(cat "$DIALOG_TMP")
    case "$_choice" in
      install)   cmd_install ;;
      update)    cmd_update ;;
      uninstall) cmd_uninstall ;;
      status)    cmd_status ;;
      config)    cmd_config ;;
      logs)      cmd_logs "" ;;
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

Run without arguments to open the interactive TUI menu.
EOF
}

# ── Entry point ───────────────────────────────────────────────
main() {
  case "${1:-}" in
    -h|--help) usage; exit 0 ;;
  esac

  # Install dialog TUI library if needed (apt / dnf / yum)
  ensure_dialog

  # Fix box-drawing characters: force ncurses to use Unicode codepoints
  # (U+2500…) instead of the terminal ACS escape sequences, which renders
  # as raw letters (q, x, l, m…) when the terminal's ACS mapping is broken.
  export NCURSES_NO_UTF8_ACS=1
  # Ensure a UTF-8 locale so the Unicode box chars are encoded correctly.
  if [[ "${LANG:-}" != *UTF-8* && "${LC_ALL:-}" != *UTF-8* ]]; then
    export LANG=C.UTF-8
  fi

  # Set globals now that dialog is available
  BACKTITLE="Leksis v${VERSION} — Deployment Tool"
  DIALOG_TMP=$(mktemp)
  trap 'rm -f "$DIALOG_TMP"' EXIT ERR

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

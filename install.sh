#!/usr/bin/env bash
# ============================================================
# Leksis Deployment Script
# Usage: ./install.sh [install|update|uninstall|status|logs]
#
# install    — Full guided installation on a fresh server
# update     — Update one or more containers selectively
# uninstall  — Clean removal of all Leksis components
# status     — Show live status of all services
# logs       — Tail logs of a service (default: app)
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
VERSION=$(grep '"version"' "$(dirname "$0")/package.json" 2>/dev/null \
  | sed 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' \
  | head -1)
VERSION="${VERSION:-1.0.0}"

# ── Colors ───────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
RESET='\033[0m'

# ── Spinner ──────────────────────────────────────────────────
_spinner_pid=""

start_spinner() {
  local msg="${1:-Working...}"
  local frames=('⣾' '⣽' '⣻' '⢿' '⡿' '⣟' '⣯' '⣷')
  (
    i=0
    while true; do
      printf "\r  ${CYAN}%s${RESET} %s  " "${frames[$((i % 8))]}" "$msg" >&2
      i=$((i + 1))
      sleep 0.1
    done
  ) &
  _spinner_pid=$!
}

stop_spinner() {
  if [[ -n "$_spinner_pid" ]] && kill -0 "$_spinner_pid" 2>/dev/null; then
    kill "$_spinner_pid" 2>/dev/null || true
    wait "$_spinner_pid" 2>/dev/null || true
    _spinner_pid=""
    printf "\r%60s\r" "" >&2
  fi
}

trap 'stop_spinner' EXIT ERR

# ── Helpers ──────────────────────────────────────────────────
info()    { stop_spinner; echo -e "${BLUE}[INFO]${RESET}  $*"; }
success() { stop_spinner; echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { stop_spinner; echo -e "${YELLOW}[WARN]${RESET}  $*"; }
error()   { stop_spinner; echo -e "${RED}[ERROR]${RESET} $*" >&2; }

STEP_CURRENT=0
STEP_TOTAL=0

header() {
  stop_spinner
  STEP_CURRENT=$((STEP_CURRENT + 1))
  if [[ "$STEP_TOTAL" -gt 0 ]]; then
    echo -e "\n${BOLD}${CYAN}▶ [${STEP_CURRENT}/${STEP_TOTAL}] $*${RESET}"
  else
    echo -e "\n${BOLD}${CYAN}▶ $*${RESET}"
  fi
}

divider() {
  local width
  width=$(tput cols 2>/dev/null || echo 60)
  printf "${CYAN}"
  printf '%0.s─' $(seq 1 "$width")
  printf "${RESET}\n"
}

ask() {
  local prompt="$1"
  local default="${2:-}"
  if [[ -n "$default" ]]; then
    echo -ne "${BOLD}$prompt${RESET} [${default}]: " >&2
  else
    echo -ne "${BOLD}$prompt${RESET}: " >&2
  fi
  read -r answer
  echo "${answer:-$default}"
}

ask_yn() {
  # ask_yn "Question" [y|n]  — default y → [Y/n], default n → [y/N]
  local prompt="$1"
  local default="${2:-n}"
  local hint
  if [[ "$default" == "y" ]]; then
    hint="[Y/n]"
  else
    hint="[y/N]"
  fi
  echo -ne "${BOLD}$prompt${RESET} $hint: " >&2
  read -r ans
  ans="${ans:-$default}"
  [[ "$ans" =~ ^[Yy]$ ]]
}

ask_secret() {
  local prompt="$1"
  local pass1 pass2
  while true; do
    echo -ne "${BOLD}$prompt${RESET} (hidden): " >&2
    read -rs pass1
    echo "" >&2
    if [[ -z "$pass1" ]]; then
      echo "$pass1"
      return 0
    fi
    echo -ne "${BOLD}Confirm password${RESET} (hidden): " >&2
    read -rs pass2
    echo "" >&2
    if [[ "$pass1" == "$pass2" ]]; then
      echo "$pass1"
      return 0
    fi
    warn "Passwords do not match. Try again."
  done
}

validate_url() {
  # Must start with http:// or https://, no trailing slash, no spaces
  [[ "$1" =~ ^https?://[^[:space:]]+[^/]$ ]]
}

validate_email() {
  [[ "$1" =~ ^[^@]+@[^@]+\.[^@]+$ ]]
}

print_banner() {
  local width
  width=$(tput cols 2>/dev/null || echo 60)
  echo ""
  divider
  local label="  Leksis v${VERSION}  "
  local pad=$(( (width - ${#label}) / 2 ))
  printf "%${pad}s${BOLD}${CYAN}%s${RESET}\n" "" "$label"
  divider
}

show_env_preview() {
  local env_content="$1"
  echo ""
  info "Preview of .env to be written (secrets masked):"
  echo -e "${CYAN}────────────────────────────────────────${RESET}"
  while IFS= read -r line; do
    if echo "$line" | grep -qE "^(POSTGRES_PASSWORD|AUTH_SECRET|ENCRYPTION_KEY|DATABASE_URL)="; then
      local key="${line%%=*}"
      echo "  ${BOLD}${key}${RESET}=****"
    else
      echo "  $line"
    fi
  done <<< "$env_content"
  echo -e "${CYAN}────────────────────────────────────────${RESET}"
}

print_summary() {
  local app_url="$1"
  local admin_email="$2"
  local install_dir="$3"
  local gpu_info="${4:-CPU-only}"
  local ollama_image="${5:-ollama/ollama:latest}"
  echo ""
  divider
  echo -e "${BOLD}${GREEN}  Installation complete!${RESET}"
  divider
  printf "  %-20s ${BOLD}%s${RESET}\n" "App URL:"      "$app_url"
  printf "  %-20s ${BOLD}%s${RESET}\n" "Admin:"        "${admin_email:-not set}"
  printf "  %-20s ${BOLD}%s${RESET}\n" "Install dir:"  "$install_dir"
  printf "  %-20s ${BOLD}%s${RESET}\n" "GPU:"          "$gpu_info"
  printf "  %-20s ${BOLD}%s${RESET}\n" "Ollama image:" "$ollama_image"
  echo ""
  echo -e "  ${CYAN}./install.sh status${RESET}  — show service status"
  echo -e "  ${CYAN}./install.sh logs${RESET}    — tail app logs"
  divider
}

# ── Package manager detection ────────────────────────────────
PKG_INSTALL=""

detect_pkg_manager() {
  if command -v apt-get &>/dev/null; then
    PKG_INSTALL="apt-get install -y"
  elif command -v dnf &>/dev/null; then
    PKG_INSTALL="dnf install -y"
  elif command -v yum &>/dev/null; then
    PKG_INSTALL="yum install -y"
  else
    warn "Could not detect package manager. Manual dependency installation may be required."
    PKG_INSTALL="echo Skipping:"
  fi
}

# ── Dependency checks ────────────────────────────────────────
check_deps() {
  local missing=()
  for dep in docker git openssl curl; do
    command -v "$dep" &>/dev/null || missing+=("$dep")
  done
  if ! docker compose version &>/dev/null 2>&1; then
    missing+=("docker-compose-plugin")
  fi
  if [[ ${#missing[@]} -gt 0 ]]; then
    warn "Missing dependencies: ${missing[*]}"
  fi
}

# ── Root check ───────────────────────────────────────────────
check_root() {
  if [[ $EUID -ne 0 ]]; then
    error "This script must be run as root (or with sudo)."
    exit 1
  fi
}

# ── Docker installation ──────────────────────────────────────
install_docker() {
  if command -v docker &>/dev/null && docker compose version &>/dev/null 2>&1; then
    success "Docker $(docker --version | cut -d' ' -f3 | tr -d ',') with Compose v2 already installed."
    return 0
  fi

  warn "Docker not found. Installing via get.docker.com..."
  curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
  sh /tmp/get-docker.sh
  rm -f /tmp/get-docker.sh

  systemctl enable docker 2>/dev/null || true
  systemctl start docker 2>/dev/null || true
  sleep 3

  if ! docker compose version &>/dev/null 2>&1; then
    info "Installing docker-compose-plugin..."
    $PKG_INSTALL docker-compose-plugin 2>/dev/null || \
      $PKG_INSTALL docker-compose 2>/dev/null || true
    sleep 2
  fi

  if ! docker compose version &>/dev/null 2>&1; then
    error "Docker Compose v2 could not be installed. Please install it manually and re-run."
    exit 1
  fi

  success "Docker $(docker --version | cut -d' ' -f3 | tr -d ',') installed successfully."
}

# ── GPU detection (multi-vendor) ─────────────────────────────
GPU_VENDOR=""
GPU_NAME=""

detect_gpu() {
  GPU_VENDOR=""
  GPU_NAME=""

  # Method 1: lspci (universal, available on most Linux servers)
  if command -v lspci &>/dev/null; then
    local line
    line=$(lspci | grep -iE "vga|3d controller|display controller" | head -1)
    if   echo "$line" | grep -qi "nvidia";                      then GPU_VENDOR="nvidia"
    elif echo "$line" | grep -qi "amd\|radeon\|advanced micro"; then GPU_VENDOR="amd"
    elif echo "$line" | grep -qi "intel";                       then GPU_VENDOR="intel"
    fi
    GPU_NAME=$(echo "$line" | sed 's/.*: //')
  fi

  # Method 2: CLI fallback if lspci absent or inconclusive
  if [[ -z "$GPU_VENDOR" ]]; then
    if command -v nvidia-smi &>/dev/null \
        && nvidia-smi --query-gpu=name --format=csv,noheader &>/dev/null 2>&1; then
      GPU_VENDOR="nvidia"
      GPU_NAME=$(nvidia-smi --query-gpu=name --format=csv,noheader | head -1)
    elif command -v rocm-smi &>/dev/null; then
      GPU_VENDOR="amd"
    fi
  fi

  case "$GPU_VENDOR" in
    nvidia) success "NVIDIA GPU detected: ${GPU_NAME}" ;;
    amd)    success "AMD GPU detected: ${GPU_NAME}" ;;
    intel)
      warn "Intel GPU detected (experimental Ollama SYCL support — using CPU mode)"
      GPU_VENDOR=""
      GPU_NAME=""
      ;;
    *) warn "No GPU detected — Ollama will run in CPU-only mode." ;;
  esac
}

# ── GPU toolkit installation ─────────────────────────────────
_install_nvidia_toolkit() {
  if docker info 2>/dev/null | grep -q "nvidia"; then
    success "nvidia-container-toolkit is already configured."
    return 0
  fi

  info "Installing nvidia-container-toolkit..."
  curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
    | gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg

  curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
    | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
    | tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

  apt-get update -qq
  apt-get install -y nvidia-container-toolkit
  nvidia-ctk runtime configure --runtime=docker
  systemctl restart docker
  success "nvidia-container-toolkit installed and configured."
}

_install_amd_rocm() {
  if docker info 2>/dev/null | grep -q "rocm\|amdgpu"; then
    success "ROCm already configured."
    return 0
  fi
  local codename
  codename=$(. /etc/os-release 2>/dev/null && echo "${UBUNTU_CODENAME:-jammy}")
  info "Installing ROCm via amdgpu-install (Ubuntu ${codename})..."
  curl -fsSL "https://repo.radeon.com/amdgpu-install/latest/ubuntu/${codename}/amdgpu-install_6.3.60300-1_all.deb" \
    -o /tmp/amdgpu-install.deb
  $PKG_INSTALL /tmp/amdgpu-install.deb
  amdgpu-install -y --usecase=rocm --no-dkms
  usermod -aG render,video root
  success "ROCm installed."
}

install_gpu_toolkit() {
  case "${GPU_VENDOR:-}" in
    nvidia) _install_nvidia_toolkit ;;
    amd)    _install_amd_rocm ;;
    *)      return 0 ;;
  esac
}

# ── Shared helpers ───────────────────────────────────────────
COMPOSE_CMD="docker compose"
OLLAMA_IMAGE="ollama/ollama:latest"

resolve_compose_cmd() {
  case "${GPU_VENDOR:-}" in
    nvidia)
      if docker info 2>/dev/null | grep -q "nvidia"; then
        COMPOSE_CMD="docker compose -f docker-compose.yml -f docker-compose.nvidia.yml"
        OLLAMA_IMAGE="ollama/ollama:latest"
        info "NVIDIA GPU — nvidia overlay enabled."
      else
        warn "NVIDIA detected but toolkit absent — falling back to CPU mode."
        COMPOSE_CMD="docker compose"
        OLLAMA_IMAGE="ollama/ollama:latest"
      fi ;;
    amd)
      COMPOSE_CMD="docker compose -f docker-compose.yml -f docker-compose.amd.yml"
      OLLAMA_IMAGE="ollama/ollama:rocm"
      info "AMD GPU — ROCm overlay enabled." ;;
    *)
      COMPOSE_CMD="docker compose"
      OLLAMA_IMAGE="ollama/ollama:latest"
      warn "CPU-only mode." ;;
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
  info "Creating PostgreSQL backup: ${backup_file}"
  if docker compose -f "${install_dir}/docker-compose.yml" exec -T postgres \
      pg_dump -U leksis_user leksis > "$backup_file" 2>/dev/null; then
    success "Backup created: ${backup_file}"
  else
    warn "PostgreSQL backup failed (container may be offline). Continuing without backup."
    rm -f "$backup_file"
  fi
}

pull_model_if_needed() {
  local model="$1"
  if $COMPOSE_CMD exec -T ollama ollama list 2>/dev/null | grep -q "^${model}"; then
    success "Model already present: ${model}"
  else
    info "Pulling model: ${model}"
    $COMPOSE_CMD exec -T ollama ollama pull "$model"
  fi
}

wait_healthy() {
  local service="$1"
  local max_wait="${2:-180}"
  local elapsed=0
  start_spinner "Waiting for ${service} to be healthy..."
  while [[ $elapsed -lt $max_wait ]]; do
    local status
    status=$(docker inspect --format='{{.State.Health.Status}}' "leksis-${service}" 2>/dev/null || echo "")
    if [[ "$status" == "healthy" ]]; then
      stop_spinner
      success "${service} is healthy."
      return 0
    fi
    sleep 5
    elapsed=$((elapsed + 5))
  done
  stop_spinner
  error "${service} did not become healthy within ${max_wait}s."
  docker compose logs --tail=20 "$service" >&2 || true
  return 1
}

show_volumes_info() {
  local install_dir="$1"
  info "Volume disk usage:"
  for vol in leksis_postgres_data leksis_ollama_data; do
    local mountpoint
    mountpoint=$(docker volume inspect "$vol" --format='{{.Mountpoint}}' 2>/dev/null || echo "")
    if [[ -n "$mountpoint" ]]; then
      printf "  %-32s %s\n" "$vol" "$(du -sh "$mountpoint" 2>/dev/null | cut -f1 || echo "?")"
    else
      printf "  %-32s %s\n" "$vol" "(not found)"
    fi
  done
}

# ── Mode: install ─────────────────────────────────────────────
cmd_install() {
  STEP_TOTAL=8
  STEP_CURRENT=0

  print_banner
  check_root
  detect_pkg_manager

  # ── Step 1 ───────────────────────────────────────────────────
  header "System requirements"
  check_deps
  install_docker
  detect_gpu
  install_gpu_toolkit
  resolve_compose_cmd

  # ── Step 2 ───────────────────────────────────────────────────
  header "Configuration"

  INSTALL_DIR=$(ask "Installation directory" "/opt/leksis")
  REPO_URL=$(ask "GitHub repository URL" "https://github.com/Mandrhax/Leksis.git")

  echo ""
  info "Application URL:"
  PROTO=$(ask "  Protocol" "http")
  SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "127.0.0.1")
  APP_DOMAIN=$(ask "  Domain or IP" "$SERVER_IP")
  APP_PORT=$(ask "  Exposed port" "3000")
  APP_URL="${PROTO}://${APP_DOMAIN}:${APP_PORT}"
  while ! validate_url "$APP_URL"; do
    warn "Invalid URL: ${APP_URL} (must start with http:// or https://, no trailing slash)"
    PROTO=$(ask "  Protocol" "$PROTO")
    APP_DOMAIN=$(ask "  Domain or IP" "$APP_DOMAIN")
    APP_PORT=$(ask "  Exposed port" "$APP_PORT")
    APP_URL="${PROTO}://${APP_DOMAIN}:${APP_PORT}"
  done
  info "Public URL: ${APP_URL}"

  echo ""
  info "Admin account:"
  ADMIN_EMAIL=""
  while true; do
    ADMIN_EMAIL=$(ask "  Admin email (leave empty to skip)" "")
    [[ -z "$ADMIN_EMAIL" ]] && break
    validate_email "$ADMIN_EMAIL" && break
    warn "Invalid email format. Try again."
  done
  ADMIN_NAME=$(ask "  Admin display name" "Admin")

  echo ""
  info "Ollama model configuration:"
  OLLAMA_MODEL=$(ask "  Translation model" "translategemma:27b")
  OLLAMA_OCR_MODEL=$(ask "  OCR model" "maternion/LightOnOCR-2")
  OLLAMA_REWRITE_MODEL=$(ask "  Rewrite model" "qwen2.5:14b")

  echo ""
  info "Ollama runtime settings:"
  OLLAMA_KEEP_ALIVE=$(ask "  Keep models in VRAM (-1=forever, 5m=5min, 0=unload)" "-1")
  OLLAMA_SCHED_SPREAD=$(ask "  GPU scheduling spread (true/false)" "false")
  OLLAMA_MAX_LOADED_MODELS=$(ask "  Max loaded models in VRAM" "3")

  echo ""
  info "PostgreSQL password (leave empty to auto-generate):"
  POSTGRES_PASSWORD=$(ask_secret "  Password")
  if [[ -z "$POSTGRES_PASSWORD" ]]; then
    POSTGRES_PASSWORD=$(openssl rand -hex 16)
    info "Auto-generated PostgreSQL password."
  fi

  # ── Step 3 ───────────────────────────────────────────────────
  header "Generating secrets"
  AUTH_SECRET=$(openssl rand -base64 32)
  ENCRYPTION_KEY=$(openssl rand -hex 32)
  success "AUTH_SECRET generated."
  success "ENCRYPTION_KEY generated."

  # ── Step 4 ───────────────────────────────────────────────────
  header "Cloning repository"
  if [[ -d "$INSTALL_DIR/.git" ]]; then
    warn "Directory $INSTALL_DIR already exists. Pulling latest changes..."
    local BRANCH
    BRANCH=$(detect_branch "$INSTALL_DIR")
    git -C "$INSTALL_DIR" pull origin "$BRANCH"
  elif [[ -d "$INSTALL_DIR" ]]; then
    warn "$INSTALL_DIR exists but is not a git repository."
    if ask_yn "Empty the directory and clone fresh?" n; then
      rm -rf "$INSTALL_DIR"
      git clone "$REPO_URL" "$INSTALL_DIR"
    else
      info "Cancelled."
      exit 0
    fi
  else
    git clone "$REPO_URL" "$INSTALL_DIR"
  fi
  success "Repository ready at $INSTALL_DIR"

  # ── Step 5 ───────────────────────────────────────────────────
  header "Writing .env"
  local ENV_CONTENT
  ENV_CONTENT=$(cat <<EOF
# Generated by install.sh on $(date -u +"%Y-%m-%dT%H:%M:%SZ")

POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
DATABASE_URL=postgresql://leksis_user:${POSTGRES_PASSWORD}@postgres:5432/leksis
AUTH_SECRET=${AUTH_SECRET}
NEXTAUTH_URL=${APP_URL}
ENCRYPTION_KEY=${ENCRYPTION_KEY}
APP_PORT=${APP_PORT}
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

  show_env_preview "$ENV_CONTENT"
  if ask_yn "Write this .env to ${INSTALL_DIR}/.env?" y; then
    printf '%s\n' "$ENV_CONTENT" > "$INSTALL_DIR/.env"
    chmod 600 "$INSTALL_DIR/.env"
    success ".env written with restricted permissions (600)."
  else
    error "Aborted by user."
    exit 1
  fi

  # ── Step 6 ───────────────────────────────────────────────────
  header "Starting Docker containers"
  cd "$INSTALL_DIR"

  for port in "$APP_PORT" "11434"; do
    if ss -tlnp 2>/dev/null | grep -q ":${port} " || \
       netstat -tlnp 2>/dev/null | grep -q ":${port} "; then
      warn "Port ${port} appears to be already in use."
      ask_yn "Continue anyway?" n || { info "Aborted."; exit 1; }
    fi
  done

  if ask_yn "Rebuild the app image from source?" y; then
    $COMPOSE_CMD up -d --build
  else
    $COMPOSE_CMD up -d
  fi

  wait_healthy postgres 120
  wait_healthy ollama 120
  wait_healthy app 180

  # ── Step 7 ───────────────────────────────────────────────────
  header "Pulling Ollama models"
  pull_model_if_needed "$OLLAMA_MODEL"
  pull_model_if_needed "$OLLAMA_OCR_MODEL"
  pull_model_if_needed "$OLLAMA_REWRITE_MODEL"
  success "All models ready."

  # ── Step 8 ───────────────────────────────────────────────────
  header "Creating admin user"
  if [[ -n "$ADMIN_EMAIL" ]]; then
    $COMPOSE_CMD exec -T postgres \
      psql -U leksis_user -d leksis \
      -v email="$ADMIN_EMAIL" \
      -v name="$ADMIN_NAME" \
      -c "INSERT INTO users (email, name, role) VALUES (:'email', :'name', 'admin')
          ON CONFLICT (email) DO UPDATE SET role = 'admin', name = :'name';"
    success "Admin user created: ${ADMIN_EMAIL}"
  else
    warn "No admin email provided. You can create one later with:"
    echo "  docker compose exec -T postgres psql -U leksis_user -d leksis \\"
    echo "    -v email='you@example.com' -v name='Admin' \\"
    echo "    -c \"INSERT INTO users (email, name, role) VALUES (:'email', :'name', 'admin');\""
  fi

  local gpu_summary="${GPU_VENDOR:-CPU}${GPU_NAME:+ ${GPU_NAME}}"
  print_summary "$APP_URL" "$ADMIN_EMAIL" "$INSTALL_DIR" "$gpu_summary" "$OLLAMA_IMAGE"
}

# ── Mode: update ─────────────────────────────────────────────
cmd_update() {
  STEP_TOTAL=0
  STEP_CURRENT=0

  divider
  echo -e "${BOLD}${CYAN}  Leksis Update — v${VERSION}${RESET}"
  divider

  check_root

  INSTALL_DIR=$(ask "Installation directory" "/opt/leksis")

  if [[ ! -f "$INSTALL_DIR/.env" ]]; then
    error "Leksis does not appear to be installed at $INSTALL_DIR (.env not found)."
    exit 1
  fi

  # Load existing config (GPU_VENDOR, OLLAMA_MODEL, etc.)
  # shellcheck source=/dev/null
  source "$INSTALL_DIR/.env"

  info "Current container status:"
  docker compose -f "$INSTALL_DIR/docker-compose.yml" ps 2>/dev/null || true

  # Automatic backup before any change
  pg_backup "$INSTALL_DIR"

  header "Fetching latest sources"
  local BRANCH
  BRANCH=$(detect_branch "$INSTALL_DIR")
  git -C "$INSTALL_DIR" pull origin "$BRANCH"
  success "Sources updated (branch: ${BRANCH})."

  # Re-detect GPU and pick the right compose overlay
  detect_gpu
  resolve_compose_cmd

  echo ""
  echo -e "${BOLD}What would you like to update?${RESET}"
  echo "  [1] App only"
  echo "  [2] PostgreSQL only"
  echo "  [3] Ollama container only"
  echo "  [4] Ollama models only (no container restart)"
  echo "  [5] Everything (containers + models)"
  echo ""
  local CHOICE
  CHOICE=$(ask "Your choice" "5")

  cd "$INSTALL_DIR"

  _update_service() {
    local svc="$1"
    info "Updating service: $svc"
    $COMPOSE_CMD up -d --build "$svc"
    wait_healthy "$svc" 180
    success "$svc updated."
  }

  _update_models() {
    pull_model_if_needed "${OLLAMA_MODEL:-translategemma:27b}"
    pull_model_if_needed "${OLLAMA_OCR_MODEL:-maternion/LightOnOCR-2}"
    pull_model_if_needed "${OLLAMA_REWRITE_MODEL:-qwen2.5:14b}"
  }

  case "$CHOICE" in
    1) _update_service app ;;
    2) _update_service postgres ;;
    3) _update_service ollama ;;
    4) _update_models ;;
    5)
      _update_service postgres
      _update_service ollama
      _update_service app
      _update_models
      ;;
    *) error "Invalid choice: $CHOICE"; exit 1 ;;
  esac

  divider
  info "Post-update status:"
  $COMPOSE_CMD ps 2>/dev/null || true
  success "Update complete. Volumes (postgres_data, ollama_data) preserved."
  divider
}

# ── Mode: uninstall ───────────────────────────────────────────
cmd_uninstall() {
  STEP_TOTAL=0
  STEP_CURRENT=0

  divider
  echo -e "${BOLD}${RED}  Leksis Uninstall — v${VERSION}${RESET}"
  divider

  check_root

  INSTALL_DIR=$(ask "Installation directory" "/opt/leksis")

  if [[ ! -f "$INSTALL_DIR/.env" ]]; then
    error "Leksis does not appear to be installed at $INSTALL_DIR (.env not found)."
    exit 1
  fi

  show_volumes_info "$INSTALL_DIR"

  echo ""
  warn "The following will be removed:"
  echo "  • Docker containers: leksis-app, leksis-postgres, leksis-ollama"
  echo "  • Docker images built locally (leksis-app)"
  echo "  • Installation directory: $INSTALL_DIR"
  echo ""

  if ask_yn "Create a PostgreSQL backup before removal?" y; then
    pg_backup "$INSTALL_DIR"
  fi

  local KEEP_DATA=false
  if ask_yn "Keep PostgreSQL data and Ollama models (volumes)?" n; then
    KEEP_DATA=true
    warn "Volumes postgres_data and ollama_data will be preserved."
  else
    warn "Volumes will be DELETED — all data will be permanently lost."
  fi

  echo ""
  echo -ne "${BOLD}${RED}Type DELETE to confirm uninstallation: ${RESET}"
  local confirm_word
  read -r confirm_word
  if [[ "$confirm_word" != "DELETE" ]]; then
    info "Uninstallation cancelled."
    exit 0
  fi

  cd "$INSTALL_DIR" 2>/dev/null || true

  header "Stopping and removing containers"
  if [[ "$KEEP_DATA" == "true" ]]; then
    docker compose down 2>/dev/null || true
  else
    docker compose down -v 2>/dev/null || true
  fi
  success "Containers stopped and removed."

  if ask_yn "Remove Ollama Docker image (may free 5–10 GB)?" n; then
    docker image rm ollama/ollama:latest ollama/ollama:rocm 2>/dev/null && \
      success "Ollama image(s) removed." || warn "Ollama image(s) not found (already removed)."
  fi

  header "Removing local Docker image"
  docker image rm leksis-app 2>/dev/null && \
    success "Image leksis-app removed." || warn "Image leksis-app not found (already removed)."

  header "Removing installation directory"
  cd /
  rm -rf "$INSTALL_DIR"
  success "Directory $INSTALL_DIR removed."

  divider
  success "Leksis has been completely removed."
  if [[ "$KEEP_DATA" == "true" ]]; then
    info "Docker volumes (postgres_data, ollama_data) were preserved."
    info "To remove them: docker volume rm leksis_postgres_data leksis_ollama_data"
  fi
  divider
}

# ── Mode: status ─────────────────────────────────────────────
cmd_status() {
  INSTALL_DIR=$(ask "Installation directory" "/opt/leksis")

  if [[ -f "$INSTALL_DIR/.env" ]]; then
    # shellcheck source=/dev/null
    source "$INSTALL_DIR/.env"
  fi

  divider
  echo -e "${BOLD}${CYAN}  Leksis Status — v${VERSION}${RESET}"
  divider

  echo ""
  echo -e "${BOLD}Containers${RESET}"
  docker compose -f "$INSTALL_DIR/docker-compose.yml" ps 2>/dev/null || \
    warn "Could not get container status."

  echo ""
  echo -e "${BOLD}GPU${RESET}"
  detect_gpu 2>/dev/null || warn "GPU detection failed."

  echo ""
  echo -e "${BOLD}Ollama models${RESET}"
  docker compose -f "$INSTALL_DIR/docker-compose.yml" exec -T ollama ollama list 2>/dev/null || \
    warn "Could not list Ollama models (container may be starting)."

  echo ""
  echo -e "${BOLD}Disk usage (volumes)${RESET}"
  show_volumes_info "$INSTALL_DIR"

  echo ""
  echo -e "${BOLD}Recent app logs (last 20 lines)${RESET}"
  docker compose -f "$INSTALL_DIR/docker-compose.yml" logs --tail=20 app 2>/dev/null || \
    warn "Could not get app logs."

  divider
}

# ── Mode: logs ────────────────────────────────────────────────
cmd_logs() {
  local service="${1:-app}"
  INSTALL_DIR=$(ask "Installation directory" "/opt/leksis")
  info "Tailing logs for: ${service} (Ctrl-C to stop)"
  docker compose -f "$INSTALL_DIR/docker-compose.yml" logs -f "$service"
}

# ── Interactive menu (no argument) ───────────────────────────
show_menu() {
  print_banner
  echo ""
  echo "  [1] Install   — Full installation on a fresh server"
  echo "  [2] Update    — Update one or more containers"
  echo "  [3] Uninstall — Clean removal of all Leksis components"
  echo "  [4] Status    — Show live status of all services"
  echo "  [5] Logs      — Tail service logs"
  echo "  [6] Exit"
  echo ""
  local CHOICE
  CHOICE=$(ask "Select an option" "1")

  case "$CHOICE" in
    1) cmd_install ;;
    2) cmd_update ;;
    3) cmd_uninstall ;;
    4) cmd_status ;;
    5)
      local SVC
      SVC=$(ask "Service to tail (app/postgres/ollama)" "app")
      cmd_logs "$SVC"
      ;;
    6) exit 0 ;;
    *) error "Invalid option: $CHOICE"; exit 1 ;;
  esac
}

usage() {
  echo "Usage: $0 [install|update|uninstall|status|logs [service]]"
  echo ""
  echo "  install    Full guided installation on a fresh server"
  echo "  update     Update one or more containers selectively"
  echo "  uninstall  Clean removal of all Leksis components"
  echo "  status     Show live status of all services"
  echo "  logs       Tail service logs (default: app)"
  echo ""
  echo "Run without arguments to open the interactive menu."
}

# ── Entry point ──────────────────────────────────────────────
main() {
  case "${1:-menu}" in
    install)   cmd_install ;;
    update)    cmd_update ;;
    uninstall) cmd_uninstall ;;
    status)    cmd_status ;;
    logs)      cmd_logs "${2:-app}" ;;
    menu)      show_menu ;;
    -h|--help) usage ;;
    *)         error "Unknown command: $1"; usage; exit 1 ;;
  esac
}

main "$@"

#!/usr/bin/env bash
# ============================================================
# Leksis Deployment Script
# Usage: ./install.sh [install|update|uninstall]
#
# install    — Full guided installation on a fresh server
# update     — Update one or more containers selectively
# uninstall  — Clean removal of all Leksis components
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

VERSION="1.0.0"

# ── Colors ───────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

# ── Helpers ──────────────────────────────────────────────────
info()    { echo -e "${BLUE}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
error()   { echo -e "${RED}[ERROR]${RESET} $*" >&2; }
header()  { echo -e "\n${BOLD}${CYAN}▶ $*${RESET}"; }
divider() { echo -e "${CYAN}────────────────────────────────────────────────────────${RESET}"; }

ask() {
  # ask "Question" "default_value" → prints answer to stdout
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

ask_secret() {
  local prompt="$1"
  echo -ne "${BOLD}$prompt${RESET} (hidden): " >&2
  read -rs answer
  echo "" >&2
  echo "$answer"
}

confirm() {
  # confirm "Question" → returns 0 (yes) or 1 (no)
  echo -ne "${BOLD}$1${RESET} [y/N]: " >&2
  read -r ans
  [[ "$ans" =~ ^[Yy]$ ]]
}

wait_healthy() {
  local service="$1"
  local max_wait="${2:-180}"
  local elapsed=0
  info "Waiting for $service to be healthy..."
  while [[ $elapsed -lt $max_wait ]]; do
    # docker inspect returns the health status reliably
    status=$(docker inspect --format='{{.State.Health.Status}}' "leksis-${service}" 2>/dev/null || echo "")
    if [[ "$status" == "healthy" ]]; then
      success "$service is healthy."
      return 0
    fi
    sleep 5
    elapsed=$((elapsed + 5))
    printf "  Waiting... (%ds / %ds)\r" "$elapsed" "$max_wait" >&2
  done
  echo "" >&2
  error "$service did not become healthy within ${max_wait}s."
  docker compose logs --tail=20 "$service" >&2 || true
  return 1
}

# ── Requirement checks ───────────────────────────────────────
check_root() {
  if [[ $EUID -ne 0 ]]; then
    error "This script must be run as root (or with sudo)."
    exit 1
  fi
}

install_docker() {
  if command -v docker &>/dev/null && docker compose version &>/dev/null 2>&1; then
    success "Docker $(docker --version | cut -d' ' -f3 | tr -d ',') with Compose v2 is already installed."
    return 0
  fi

  warn "Docker not found. Installing via get.docker.com..."
  curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
  sh /tmp/get-docker.sh
  rm -f /tmp/get-docker.sh

  # Enable and start the Docker daemon (ignore error if already running)
  systemctl enable docker 2>/dev/null || true
  systemctl start docker 2>/dev/null || true

  # Give the daemon a moment to fully start
  sleep 3

  # Install docker-compose-plugin explicitly if 'docker compose' is not available
  if ! docker compose version &>/dev/null 2>&1; then
    info "Installing docker-compose-plugin..."
    apt-get install -y docker-compose-plugin 2>/dev/null || \
      apt-get install -y docker-compose 2>/dev/null || true
    sleep 2
  fi

  # Final check
  if ! docker compose version &>/dev/null 2>&1; then
    error "Docker Compose v2 could not be installed. Please install it manually and re-run this script."
    exit 1
  fi

  success "Docker $(docker --version | cut -d' ' -f3 | tr -d ',') installed successfully."
}

check_gpu() {
  # Always initialize so set -u never complains
  GPU_AVAILABLE=false
  GPU_NAME=""

  if ! command -v nvidia-smi &>/dev/null; then
    warn "nvidia-smi not found. Ollama will run in CPU-only mode."
    return 0
  fi

  # nvidia-smi exists — try to query an actual GPU (may fail on driver-only installs)
  GPU_NAME=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1 || true)

  if [[ -n "$GPU_NAME" ]]; then
    success "NVIDIA GPU detected: ${GPU_NAME}"
    GPU_AVAILABLE=true
  else
    warn "nvidia-smi found but no physical GPU detected. Ollama will run in CPU-only mode."
  fi
}

install_nvidia_toolkit() {
  if [[ "$GPU_AVAILABLE" != "true" ]]; then
    return 0
  fi

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

# ── Mode: install ────────────────────────────────────────────
cmd_install() {
  divider
  echo -e "${BOLD}${CYAN}  Leksis Installation — v${VERSION}${RESET}"
  divider

  check_root

  header "Step 1/8 — System requirements"
  install_docker
  check_gpu
  install_nvidia_toolkit

  header "Step 2/8 — Configuration"

  INSTALL_DIR=$(ask "Installation directory" "/opt/leksis")
  REPO_URL=$(ask "GitHub repository URL" "https://github.com/Mandrhax/Leksis.git")
  APP_URL=$(ask "Public URL of the application (no trailing slash)" "https://leksis.example.com")
  ADMIN_EMAIL=$(ask "Admin email address" "")
  ADMIN_NAME=$(ask "Admin display name" "Admin")

  echo ""
  info "Ollama model configuration:"
  OLLAMA_MODEL=$(ask "  Translation model" "translategemma:27b")
  OLLAMA_OCR_MODEL=$(ask "  OCR model" "maternion/LightOnOCR-2")
  OLLAMA_REWRITE_MODEL=$(ask "  Rewrite model" "qwen2.5:14b")

  echo ""
  info "Ollama runtime settings:"
  OLLAMA_KEEP_ALIVE=$(ask "  Keep models in VRAM (-1 = forever, 5m = 5 min, 0 = unload immediately)" "-1")
  OLLAMA_SCHED_SPREAD=$(ask "  GPU scheduling spread (number of GPUs to spread across, false = disable)" "4")

  echo ""
  info "PostgreSQL password (leave empty to auto-generate):"
  POSTGRES_PASSWORD=$(ask_secret "  Password")
  if [[ -z "$POSTGRES_PASSWORD" ]]; then
    POSTGRES_PASSWORD=$(openssl rand -hex 16)
    info "Auto-generated PostgreSQL password."
  fi

  header "Step 3/8 — Generating secrets"
  AUTH_SECRET=$(openssl rand -base64 32)
  ENCRYPTION_KEY=$(openssl rand -hex 32)
  success "AUTH_SECRET generated."
  success "ENCRYPTION_KEY generated."

  header "Step 4/8 — Cloning repository"
  if [[ -d "$INSTALL_DIR/.git" ]]; then
    warn "Directory $INSTALL_DIR already exists. Pulling latest changes..."
    git -C "$INSTALL_DIR" pull origin main
  else
    git clone "$REPO_URL" "$INSTALL_DIR"
  fi
  success "Repository ready at $INSTALL_DIR"

  header "Step 5/8 — Writing .env"
  cat > "$INSTALL_DIR/.env" <<EOF
# Generated by install.sh on $(date -u +"%Y-%m-%dT%H:%M:%SZ")

POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
DATABASE_URL=postgresql://leksis_user:${POSTGRES_PASSWORD}@postgres:5432/leksis
AUTH_SECRET=${AUTH_SECRET}
NEXTAUTH_URL=${APP_URL}
ENCRYPTION_KEY=${ENCRYPTION_KEY}
OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_MODEL=${OLLAMA_MODEL}
OLLAMA_OCR_MODEL=${OLLAMA_OCR_MODEL}
OLLAMA_REWRITE_MODEL=${OLLAMA_REWRITE_MODEL}
OLLAMA_KEEP_ALIVE=${OLLAMA_KEEP_ALIVE}
OLLAMA_SCHED_SPREAD=${OLLAMA_SCHED_SPREAD}
EOF
  chmod 600 "$INSTALL_DIR/.env"
  success ".env written with restricted permissions (600)."

  header "Step 6/8 — Starting Docker containers"
  cd "$INSTALL_DIR"

  # Use GPU override if a physical GPU was detected and toolkit is configured
  if [[ "$GPU_AVAILABLE" == "true" ]] && docker info 2>/dev/null | grep -q "nvidia"; then
    info "GPU detected and configured — starting with GPU support."
    COMPOSE_CMD="docker compose -f docker-compose.yml -f docker-compose.gpu.yml"
  else
    warn "Starting Ollama in CPU-only mode (no GPU or nvidia-container-toolkit not configured)."
    COMPOSE_CMD="docker compose"
  fi

  $COMPOSE_CMD up -d --build
  wait_healthy postgres 120
  wait_healthy ollama 120
  wait_healthy app 180

  header "Step 7/8 — Pulling Ollama models"
  info "Pulling translation model: ${OLLAMA_MODEL}"
  docker compose exec ollama ollama pull "$OLLAMA_MODEL"

  info "Pulling OCR model: ${OLLAMA_OCR_MODEL}"
  docker compose exec ollama ollama pull "$OLLAMA_OCR_MODEL"

  info "Pulling rewrite model: ${OLLAMA_REWRITE_MODEL}"
  docker compose exec ollama ollama pull "$OLLAMA_REWRITE_MODEL"

  success "All models pulled."

  header "Step 8/8 — Creating admin user"
  if [[ -n "$ADMIN_EMAIL" ]]; then
    docker compose exec postgres psql -U leksis_user -d leksis \
      -c "INSERT INTO users (email, name, role) VALUES ('${ADMIN_EMAIL}', '${ADMIN_NAME}', 'admin') ON CONFLICT (email) DO UPDATE SET role = 'admin', name = '${ADMIN_NAME}';"
    success "Admin user created: ${ADMIN_EMAIL}"
  else
    warn "No admin email provided. You can create one later with:"
    echo "  docker compose exec postgres psql -U leksis_user -d leksis \\"
    echo "    -c \"INSERT INTO users (email, name, role) VALUES ('you@example.com', 'Admin', 'admin');\""
  fi

  divider
  echo -e "${BOLD}${GREEN}  Installation complete!${RESET}"
  divider
  echo -e "  App URL:     ${BOLD}${APP_URL}${RESET}"
  echo -e "  Admin:       ${BOLD}${ADMIN_EMAIL:-not set}${RESET}"
  echo -e "  Install dir: ${BOLD}${INSTALL_DIR}${RESET}"
  echo ""
  echo -e "  To view logs:   ${CYAN}docker compose -f ${INSTALL_DIR}/docker-compose.yml logs -f${RESET}"
  echo -e "  To check status: ${CYAN}docker compose -f ${INSTALL_DIR}/docker-compose.yml ps${RESET}"
  divider
}

# ── Mode: update ─────────────────────────────────────────────
cmd_update() {
  divider
  echo -e "${BOLD}${CYAN}  Leksis Update — v${VERSION}${RESET}"
  divider

  check_root

  INSTALL_DIR=$(ask "Installation directory" "/opt/leksis")

  if [[ ! -f "$INSTALL_DIR/.env" ]]; then
    error "Leksis does not appear to be installed at $INSTALL_DIR (.env not found)."
    exit 1
  fi

  header "Fetching latest sources"
  git -C "$INSTALL_DIR" pull origin main
  success "Sources updated."

  echo ""
  echo -e "${BOLD}What would you like to update?${RESET}"
  echo "  [1] Leksis app only"
  echo "  [2] PostgreSQL only"
  echo "  [3] Ollama only"
  echo "  [4] Update everything"
  echo ""
  CHOICE=$(ask "Your choice" "4")

  cd "$INSTALL_DIR"

  update_service() {
    local svc="$1"
    info "Updating service: $svc"
    docker compose up -d --build "$svc"
    wait_healthy "$svc" 180
    success "$svc updated."
  }

  case "$CHOICE" in
    1) update_service app ;;
    2) update_service postgres ;;
    3) update_service ollama ;;
    4)
      update_service postgres
      update_service ollama
      update_service app
      ;;
    *)
      error "Invalid choice: $CHOICE"
      exit 1
      ;;
  esac

  divider
  success "Update complete. Volumes (postgres_data, ollama_data) were preserved."
  divider
}

# ── Mode: uninstall ──────────────────────────────────────────
cmd_uninstall() {
  divider
  echo -e "${BOLD}${RED}  Leksis Uninstall — v${VERSION}${RESET}"
  divider

  check_root

  INSTALL_DIR=$(ask "Installation directory" "/opt/leksis")

  echo ""
  warn "The following will be removed:"
  echo "  • Docker containers: leksis-app, leksis-postgres, leksis-ollama"
  echo "  • Docker images built locally (leksis-app)"
  echo "  • Installation directory: $INSTALL_DIR"
  echo ""

  KEEP_DATA=false
  if confirm "Keep PostgreSQL data and Ollama models (volumes)?"; then
    KEEP_DATA=true
    warn "Volumes postgres_data and ollama_data will be preserved."
  else
    warn "Volumes will be DELETED — all data will be permanently lost."
  fi

  echo ""
  echo -ne "${BOLD}${RED}Type DELETE to confirm uninstallation: ${RESET}"
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

  header "Removing local Docker image"
  docker image rm leksis-app 2>/dev/null && success "Image leksis-app removed." || warn "Image leksis-app not found (already removed)."

  header "Removing installation directory"
  cd /
  rm -rf "$INSTALL_DIR"
  success "Directory $INSTALL_DIR removed."

  divider
  success "Leksis has been completely removed."
  if [[ "$KEEP_DATA" == "true" ]]; then
    info "Docker volumes (postgres_data, ollama_data) were preserved."
    info "To remove them manually: docker volume rm leksis_postgres_data leksis_ollama_data"
  fi
  divider
}

# ── Interactive menu (no argument) ───────────────────────────
show_menu() {
  divider
  echo -e "${BOLD}${CYAN}  Leksis Deployment — v${VERSION}${RESET}"
  divider
  echo ""
  echo "  [1] Install   — Full installation on a fresh server"
  echo "  [2] Update    — Update one or more containers"
  echo "  [3] Uninstall — Clean removal of all Leksis components"
  echo "  [4] Exit"
  echo ""
  CHOICE=$(ask "Select an option" "1")

  case "$CHOICE" in
    1) cmd_install ;;
    2) cmd_update ;;
    3) cmd_uninstall ;;
    4) exit 0 ;;
    *) error "Invalid option: $CHOICE"; exit 1 ;;
  esac
}

usage() {
  echo "Usage: $0 [install|update|uninstall]"
  echo ""
  echo "  install    Full guided installation on a fresh server"
  echo "  update     Update one or more containers selectively"
  echo "  uninstall  Clean removal of all Leksis components"
  echo ""
  echo "Run without arguments to open the interactive menu."
}

# ── Entry point ──────────────────────────────────────────────
main() {
  case "${1:-menu}" in
    install)   cmd_install ;;
    update)    cmd_update ;;
    uninstall) cmd_uninstall ;;
    menu)      show_menu ;;
    -h|--help) usage ;;
    *)         error "Unknown command: $1"; usage; exit 1 ;;
  esac
}

main "$@"

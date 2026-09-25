#!/usr/bin/env bash
# ============================================================
# Leksis Deployment Script
# Usage: ./install.sh [options] [command]
#
# Commands:
#   install    - Full guided installation on a fresh server
#   update     - Update one or more components (with automatic rollback)
#   backup     - Backup database, uploads and .env
#   restore    - Restore a backup created by "backup"
#   uninstall  - Clean removal of all Leksis components
#   status     - Show live status of all services
#   config     - Edit configuration (models, Ollama local/remote, ...)
#   logs       - Tail logs of a service
#
# Options: -y/--yes  --answers FILE  --dir DIR  --no-tui  -h/--help
#
# Run from a server via curl (stdin-safe):
#   bash <(curl -fsSL https://raw.githubusercontent.com/Mandrhax/Leksis/v1.5.0/install.sh)
# ============================================================
set -eEuo pipefail

# ── VERSION (bumped at release; package.json wins when present) ──
VERSION="1.5.0"
SCRIPT_PATH="$(readlink -f "${BASH_SOURCE[0]}" 2>/dev/null || echo "$0")"
_pkg="$(dirname "$SCRIPT_PATH")/package.json"
if [[ -f "$_pkg" ]]; then
  _v=$(grep '"version"' "$_pkg" \
    | sed 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' \
    | head -1 || true)
  VERSION="${_v:-$VERSION}"
  unset _v
fi
unset _pkg
RAW_URL="https://raw.githubusercontent.com/Mandrhax/Leksis/v${VERSION}/install.sh"

# ── Constants ─────────────────────────────────────────────────
DEFAULT_INSTALL_DIR="/opt/leksis"
DEFAULT_REPO_URL="https://github.com/Mandrhax/Leksis.git"
LEKSIS_CONF_DIR="/etc/leksis"
INSTALL_CONF="${LEKSIS_CONF_DIR}/install.conf"
ANSWERS_SAVE="${LEKSIS_CONF_DIR}/install.answers"
LOG_FILE=""
MIN_COMPOSE_VERSION="2.20.0"
BACKUP_KEEP="${LEKSIS_BACKUP_KEEP:-7}"

DEFAULT_MODEL="translategemma:27b"
DEFAULT_OCR_MODEL="maternion/LightOnOCR-2:latest"
DEFAULT_REWRITE_MODEL="qwen2.5:14b"

# gum (TUI) — pinned release + SHA256 of the Linux archives
GUM_VERSION="2.0.1"
GUM_SHA256_AMD64="4dfe4547f960813864c803b3617aa64427fa32ca566707fde949e08975297c48"
GUM_SHA256_ARM64="6998202a8fea27bb2007f69e44ec5dcb4cff5268c62d995de857eee0e2cd52cb"

# ── Runtime state ─────────────────────────────────────────────
NONINTERACTIVE=false
NO_TUI=false
ANSWERS_FILE=""
TTY_OK=false
USE_GUM=false
MENU_DEPTH=0
PKG_MGR=""
APT_UPDATED=false
INSTALL_DIR=""
GPU_VENDOR=""
GPU_NAME=""
COMPOSE_FILE_VALUE="docker-compose.yml"
OLLAMA_IMAGE="ollama/ollama:latest"
COMPOSE_PROJECT="leksis"
OLLAMA_MODE="local"          # AI engine: local (Ollama container) | remote (Ollama server) | openai (OpenAI-compatible API)
AI_API_KEY=""                # API key of the OpenAI-compatible server (optional)
OLLAMA_URL=""                # remote server / API base URL as seen from the containers
OLLAMA_URL_HOSTSIDE=""       # same server as seen from this host (differs for host.docker.internal)
ACCESS_MODE="http"           # how users reach Leksis: http | https (domain + Let's Encrypt) | proxy (behind NPM, Traefik…)
ACCESS_HOST=""               # domain name (https mode)
ACCESS_FALLBACK="true"       # https mode: keep plain-HTTP access by IP while the certificate is set up
ACCESS_TRUSTED=""            # proxy mode: proxy IP / CIDR when it is not on a private network
OLLAMA_MODEL="$DEFAULT_MODEL"
OLLAMA_OCR_MODEL="$DEFAULT_OCR_MODEL"
OLLAMA_REWRITE_MODEL="$DEFAULT_REWRITE_MODEL"
OLLAMA_KEEP_ALIVE="-1"
OLLAMA_SCHED_SPREAD="true"
OLLAMA_MAX_LOADED_MODELS="3"
FAILED_MODELS=()
C_RESET="" C_DIM="" C_GREEN="" C_YELLOW="" C_RED="" C_BOLD=""

# ── Terminal setup ────────────────────────────────────────────
# All UI output goes to fd 3 (the tty, or stderr when there is none) so that
# helpers still work inside $(...) captures and never mix with command output.
setup_terminal() {
  if { : </dev/tty; } 2>/dev/null; then
    TTY_OK=true
    exec 3>/dev/tty
  else
    exec 3>&2
  fi
  if $TTY_OK && [[ -z "${NO_COLOR:-}" && "${TERM:-dumb}" != "dumb" ]]; then
    C_RESET=$'\033[0m'; C_DIM=$'\033[2m'; C_GREEN=$'\033[32m'
    C_YELLOW=$'\033[33m'; C_RED=$'\033[31m'; C_BOLD=$'\033[1m'
  fi
}

init_logging() {
  mkdir -p /var/log 2>/dev/null || true
  LOG_FILE="/var/log/leksis-install.log"
  if ! { touch "$LOG_FILE" && chmod 600 "$LOG_FILE"; } 2>/dev/null; then LOG_FILE=""; fi
  log_line "=== leksis install.sh v${VERSION} — $*"
}

log_line() {
  [[ -n "$LOG_FILE" ]] && printf '%s %s\n' "$(date '+%F %T')" "$*" >>"$LOG_FILE" 2>/dev/null || true
}

# ── Output helpers ────────────────────────────────────────────
p_header() {
  log_line "== $1"
  if $USE_GUM; then
    gum style --border rounded --border-foreground 63 --bold \
      --padding "0 2" --margin "1 0 0 1" "$1" >&3 2>&3 || true
  else
    printf '\n============================================================\n  %s\n============================================================\n' "$1" >&3
  fi
}
p_info() { log_line "INFO $1"; printf '  %s-->%s %s\n' "$C_DIM" "$C_RESET" "$1" >&3; }
p_ok()   { log_line "OK   $1"; printf '  %s[OK]%s %s\n' "$C_GREEN" "$C_RESET" "$1" >&3; }
p_warn() { log_line "WARN $1"; printf '  %s[!]%s  %s\n' "$C_YELLOW" "$C_RESET" "$1" >&3; }
p_err()  { log_line "ERR  $1"; printf '  %s[ERROR]%s %s\n' "$C_RED" "$C_RESET" "$1" >&3; }
p_kv()   { log_line "$1: $2"; printf '  %s%-18s%s %s\n' "$C_BOLD" "$1" "$C_RESET" "$2" >&3; }
say()    { printf '%s\n' "$*" >&3; }
die()    { p_err "$1"; exit 1; }

# clear_screen — wipes the visible screen (scrollback kept); only in interactive mode
clear_screen() {
  if $TTY_OK && ! $NONINTERACTIVE; then printf '\033[H\033[2J' >&3; fi
  return 0
}

p_banner() {
  if $USE_GUM; then
    gum style --border double --border-foreground 212 --bold --align center \
      --padding "1 4" --margin "1 0 0 1" "LEKSIS" "v${VERSION} — Deployment Manager" >&3 2>&3 || true
  else
    p_header "Leksis v${VERSION} - Deployment Manager"
  fi
}

_abort() { printf '\n  Cancelled.\n' >&3; exit 130; }

on_error() {
  local rc="$1" line="$2"
  (( BASH_SUBSHELL > MENU_DEPTH )) && return 0
  [[ "$rc" -eq 130 ]] && exit 130
  p_err "Unexpected error (exit ${rc}) near line ${line}."
  [[ -n "$LOG_FILE" ]] && p_err "Details: ${LOG_FILE}"
  return 0
}

# ── Prompt helpers ────────────────────────────────────────────
# Every prompt takes a KEY first. LEKSIS_<KEY> (env or --answers file) answers
# it without asking; in --yes mode the default is used when there is no answer.
# Values are printed on stdout, so use them as x=$(p_input KEY "Question" "default").

# p_preset KEY → prints the preset value, returns 1 when none
p_preset() {
  local var="LEKSIS_$1"
  [[ -n "${!var+x}" ]] || return 1
  printf '%s' "${!var}"
}
p_unset_preset() { unset "LEKSIS_$1" 2>/dev/null || true; }

p_input() {
  local key="$1" prompt="$2" default="${3:-}" value
  if p_preset "$key"; then return 0; fi
  if $NONINTERACTIVE; then printf '%s' "$default"; return 0; fi
  if $USE_GUM; then
    value=$(gum input --header="$prompt" --prompt="> " --value="$default" \
      </dev/tty 2>&3) || _abort
    printf '  %s: %s\n' "$prompt" "${value:-$default}" >&3
  else
    if [[ -n "$default" ]]; then printf '  %s [%s]: ' "$prompt" "$default" >&3
    else printf '  %s: ' "$prompt" >&3; fi
    read -r value </dev/tty || _abort
  fi
  printf '%s' "${value:-$default}"
}

# p_yesno KEY "question" y|n → 0=yes / 1=no
p_yesno() {
  local key="$1" question="$2" default="${3:-y}" answer rc d=true hint
  if answer=$(p_preset "$key"); then
    case "${answer,,}" in y|yes|true|1) return 0 ;; *) return 1 ;; esac
  fi
  if $NONINTERACTIVE; then [[ "$default" == "y" ]]; return; fi
  if $USE_GUM; then
    [[ "$default" == "n" ]] && d=false
    rc=0
    gum confirm "$question" --default="$d" </dev/tty 2>&3 || rc=$?
    case $rc in
      0) printf '  %s: yes\n' "$question" >&3; return 0 ;;
      1) printf '  %s: no\n'  "$question" >&3; return 1 ;;
      *) _abort ;;
    esac
  fi
  [[ "$default" == "y" ]] && hint="[Y/n]" || hint="[y/N]"
  while true; do
    printf '  %s %s: ' "$question" "$hint" >&3
    read -r answer </dev/tty || _abort
    answer="${answer:-$default}"
    case "${answer,,}" in
      y|yes) return 0 ;;
      n|no)  return 1 ;;
      *) p_warn "Please answer y or n." ;;
    esac
  done
}

# p_password KEY "prompt" → password on stdout (empty = auto-generate)
p_password() {
  local key="$1" prompt="$2" p1 p2
  if p_preset "$key"; then return 0; fi
  if $NONINTERACTIVE; then printf '%s' ""; return 0; fi
  while true; do
    if $USE_GUM; then
      p1=$(gum input --password --header="${prompt} (empty = auto-generate)" --prompt="> " \
        </dev/tty 2>&3) || _abort
    else
      printf '  %s (empty = auto-generate): ' "$prompt" >&3
      read -rs p1 </dev/tty || _abort; echo >&3
    fi
    if [[ -z "$p1" ]]; then printf '%s' ""; return 0; fi
    if $USE_GUM; then
      p2=$(gum input --password --header="Confirm password" --prompt="> " </dev/tty 2>&3) || _abort
    else
      printf '  Confirm password: ' >&3
      read -rs p2 </dev/tty || _abort; echo >&3
    fi
    if [[ "$p1" == "$p2" ]]; then printf '%s' "$p1"; return 0; fi
    p_warn "Passwords do not match. Try again."
  done
}

# p_secret KEY "prompt" → secret on stdout, no confirmation (API keys are pasted); empty allowed
p_secret() {
  local key="$1" prompt="$2" v
  if p_preset "$key"; then return 0; fi
  if $NONINTERACTIVE; then printf '%s' ""; return 0; fi
  if $USE_GUM; then
    v=$(gum input --password --header="$prompt" --prompt="> " </dev/tty 2>&3) || _abort
  else
    printf '  %s: ' "$prompt" >&3
    read -rs v </dev/tty || _abort; echo >&3
  fi
  printf '%s' "$v"
}

# p_choose KEY "Header" default_value "value|Label" ... → selected value
p_choose() {
  local key="$1" header="$2" default="$3"; shift 3
  if p_preset "$key"; then return 0; fi
  local -a values=() labels=() extra=()
  local o i sel="" default_label="" n
  for o in "$@"; do values+=("${o%%|*}"); labels+=("${o#*|}"); done
  if $NONINTERACTIVE; then printf '%s' "$default"; return 0; fi
  for i in "${!values[@]}"; do
    [[ "${values[$i]}" == "$default" ]] && default_label="${labels[$i]}"
  done
  if $USE_GUM; then
    [[ -n "$default_label" ]] && extra=(--selected="$default_label")
    sel=$(gum choose --header="$header" --height=12 "${extra[@]+"${extra[@]}"}" \
      "${labels[@]}" </dev/tty 2>&3) || _abort
    printf '  %s: %s\n' "$header" "$sel" >&3
    for i in "${!labels[@]}"; do
      [[ "${labels[$i]}" == "$sel" ]] && { printf '%s' "${values[$i]}"; return 0; }
    done
    printf '%s' "$default"; return 0
  fi
  printf '\n  %s\n' "$header" >&3
  for i in "${!labels[@]}"; do printf '    %d) %s\n' "$((i + 1))" "${labels[$i]}" >&3; done
  for i in "${!values[@]}"; do [[ "${values[$i]}" == "$default" ]] && n=$((i + 1)); done
  while true; do
    printf '  Choice [%s]: ' "${n:-1}" >&3
    read -r sel </dev/tty || _abort
    sel="${sel:-${n:-1}}"
    if [[ "$sel" =~ ^[0-9]+$ ]] && (( sel >= 1 && sel <= ${#values[@]} )); then
      printf '%s' "${values[$((sel - 1))]}"; return 0
    fi
    p_warn "Enter a number between 1 and ${#values[@]}."
  done
}

# p_multi KEY "Header" "default values (space-separated)" "value|Label" ...
# → selected values, space-separated
p_multi() {
  local key="$1" header="$2" defaults="$3"; shift 3
  if p_preset "$key"; then return 0; fi
  local -a values=() labels=() picked=()
  local o i v sel line dl=""
  for o in "$@"; do values+=("${o%%|*}"); labels+=("${o#*|}"); done
  if $NONINTERACTIVE; then printf '%s' "$defaults"; return 0; fi
  if $USE_GUM; then
    for i in "${!values[@]}"; do
      for v in $defaults; do
        [[ "${values[$i]}" == "$v" ]] && dl+="${dl:+,}${labels[$i]}"
      done
    done
    local -a extra=()
    [[ -n "$dl" ]] && extra=(--selected="$dl")
    sel=$(gum choose --no-limit --header="$header" \
      --height 12 "${extra[@]+"${extra[@]}"}" "${labels[@]}" </dev/tty 2>&3) || _abort
    while IFS= read -r line; do
      [[ -z "$line" ]] && continue
      for i in "${!labels[@]}"; do
        [[ "${labels[$i]}" == "$line" ]] && picked+=("${values[$i]}")
      done
    done <<<"$sel"
    printf '  %s: %s\n' "$header" "${picked[*]:-none}" >&3
    printf '%s' "${picked[*]:-}"; return 0
  fi
  printf '\n  %s\n' "$header" >&3
  for i in "${!values[@]}"; do
    local d=n
    for v in $defaults; do [[ "${values[$i]}" == "$v" ]] && d=y; done
    if p_yesno "_MULTI_${key}_${values[$i]}" "${labels[$i]}?" "$d"; then picked+=("${values[$i]}"); fi
  done
  printf '%s' "${picked[*]:-}"
}

p_pause() {
  $NONINTERACTIVE && return 0
  printf '\n  Press Enter to continue...' >&3
  read -r _ </dev/tty || true
}

# p_spin "Title" cmd args... — runs a command behind a spinner (gum) or a plain
# status line; output goes to the log and is shown only when the command fails.
# External commands only (gum cannot call shell functions).
p_spin() {
  local title="$1"; shift
  local tmp rc=0
  tmp=$(mktemp)
  log_line "RUN ${title}: $*"
  if $USE_GUM; then
    gum spin --title "${title}..." -- bash -c 'exec "$@" >"$0" 2>&1' "$tmp" "$@" \
      </dev/tty >&3 2>&3 || rc=$?
  else
    p_info "${title}..."
    "$@" >"$tmp" 2>&1 || rc=$?
  fi
  [[ -n "$LOG_FILE" ]] && cat "$tmp" >>"$LOG_FILE" 2>/dev/null || true
  if [[ $rc -eq 0 ]]; then
    p_ok "$title"
  else
    p_err "${title} failed (exit ${rc}). Last output:"
    tail -n 15 "$tmp" | sed 's/^/      /' >&3 || true
  fi
  rm -f "$tmp"
  return $rc
}

# run_logged cmd args... — streams output to the terminal and the log file
run_logged() {
  log_line "RUN $*"
  if [[ -n "$LOG_FILE" ]]; then "$@" 2>&1 | tee -a "$LOG_FILE"; else "$@"; fi
}

# ── Progress bars ─────────────────────────────────────────────
BAR_MILESTONE=-1

# human_bytes N → "512 MB" / "7.4 GB"
human_bytes() {
  local n="$1"
  if (( n >= 1073741824 )); then
    printf '%d.%d GB' "$((n / 1073741824))" "$(( (n * 10 / 1073741824) % 10 ))"
  else
    printf '%d MB' "$((n / 1048576))"
  fi
}

# draw_bar "Title" PERCENT "detail" — one redrawn line on a tty, 10% milestones otherwise
draw_bar() {
  local title="$1" pct="$2" detail="${3:-}" width=20 filled i bar="" full="█" empty="░" cols avail
  (( pct > 100 )) && pct=100
  (( pct < 0 )) && pct=0
  if ! $TTY_OK; then
    if (( pct / 10 > BAR_MILESTONE )); then
      BAR_MILESTONE=$((pct / 10))
      p_info "${title}: ${pct}%"
    fi
    return 0
  fi
  [[ "${LC_ALL:-${LANG:-}}" == *[Uu][Tt][Ff]* ]] || { full="#"; empty="-"; }
  filled=$(( pct * width / 100 ))
  for (( i = 0; i < width; i++ )); do
    if (( i < filled )); then bar+="$full"; else bar+="$empty"; fi
  done
  cols=$(tput cols 2>/dev/null || echo 80)
  avail=$(( cols - 34 ))
  (( avail < 10 )) && avail=10
  if (( ${#title} + ${#detail} + 2 > avail )); then
    # keep the detail (speed / size) and shorten the title, unless there is no room
    if (( avail - ${#detail} - 2 >= 12 )); then title="${title:0:$((avail - ${#detail} - 2))}"; else detail=""; fi
  fi
  title="${title:0:avail}"
  printf '\r\033[K  %s [%s] %3d%%%s' "$title" "$bar" "$pct" "${detail:+  $detail}" >&3
  return 0
}

end_bar() { $TTY_OK && printf '\r\033[K' >&3; BAR_MILESTONE=-1; return 0; }

# fmt_elapsed SECONDS → m:ss
fmt_elapsed() { printf '%d:%02d' "$(( $1 / 60 ))" "$(( $1 % 60 ))"; }

# run_with_bar "Title" layers|steps cmd args...
# Runs a docker command and turns its output into a progress bar:
#   layers — `docker compose pull`: layers finished / layers seen
#   steps  — `docker compose build` (BuildKit plain): build steps done / steps seen
# The full output goes to the log; the last lines are shown only on failure.
run_with_bar() {
  local title="$1" mode="$2"; shift 2
  local tmp rcfile rc=0 line id st pct=0 shown=-1 start=$SECONDS now last_draw=-1
  local done_n=0 total_n=0 current="" stage n
  local -A layer=() vertex=() counted=() stage_total=()
  tmp=$(mktemp); rcfile=$(mktemp)
  log_line "RUN ${title}: $*"
  draw_bar "$title" 0 "0:00"
  while IFS= read -r line; do
    printf '%s\n' "$line" >>"$tmp"
    if [[ "$mode" == "layers" ]]; then
      if [[ "$line" =~ ([0-9a-f]{12})[[:space:]]+(Pulling\ fs\ layer|Already\ exists|Pull\ complete) ]]; then
        id="${BASH_REMATCH[1]}"; st="${BASH_REMATCH[2]}"
        if [[ -z "${layer[$id]:-}" ]]; then layer[$id]=1; total_n=$((total_n + 1)); fi
        if [[ "$st" != "Pulling fs layer" && "${layer[$id]}" != 2 ]]; then
          layer[$id]=2; done_n=$((done_n + 1))
        fi
      fi
    else
      if [[ "$line" =~ ^#([0-9]+)\ \[([^]]+)\ ([0-9]+)/([0-9]+)\]\ (.*)$ ]]; then
        id="${BASH_REMATCH[1]}"; stage="${BASH_REMATCH[2]}"; n="${BASH_REMATCH[4]}"
        vertex[$id]=1; stage_total[$stage]="$n"; current="${BASH_REMATCH[5]}"
        total_n=0
        for st in "${stage_total[@]}"; do total_n=$((total_n + st)); done
      elif [[ "$line" =~ ^#([0-9]+)\ (DONE|CACHED) ]]; then
        id="${BASH_REMATCH[1]}"
        if [[ -n "${vertex[$id]:-}" && -z "${counted[$id]:-}" ]]; then
          counted[$id]=1; done_n=$((done_n + 1))
        fi
      fi
    fi
    if (( total_n > 0 )); then
      pct=$(( done_n * 100 / total_n ))
      (( pct > 99 )) && pct=99
      (( pct < shown )) && pct=$shown        # never go backwards
    fi
    now=$SECONDS
    if (( pct != shown || now != last_draw )); then
      shown=$pct; last_draw=$now
      draw_bar "$title" "$pct" "$(fmt_elapsed $((now - start)))${current:+  ${current:0:24}}"
    fi
  done < <( { if [[ "$mode" == "steps" ]]; then export BUILDKIT_PROGRESS=plain; fi
              "$@" 2>&1 && echo 0 >"$rcfile" || echo $? >"$rcfile"; } )
  rc=$(cat "$rcfile" 2>/dev/null || echo 1)
  [[ -n "$LOG_FILE" ]] && cat "$tmp" >>"$LOG_FILE" 2>/dev/null || true
  end_bar
  if [[ "$rc" -eq 0 ]]; then
    p_ok "${title} ($(fmt_elapsed $((SECONDS - start))))"
  else
    p_err "${title} failed (exit ${rc}). Last output:"
    tail -n 15 "$tmp" | sed 's/^/      /' >&3 || true
  fi
  rm -f "$tmp" "$rcfile"
  return "$rc"
}

# ollama_api_url → URL of the Ollama API reachable from this host ("" if unknown)
ollama_api_url() {
  local ip
  if [[ "$OLLAMA_MODE" == "remote" ]]; then printf '%s' "${OLLAMA_URL_HOSTSIDE:-$OLLAMA_URL}"; return 0; fi
  ip=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' leksis-ollama 2>/dev/null || true)
  [[ -n "$ip" ]] && printf 'http://%s:11434' "$ip"
  return 0
}

# api_pull_with_bar MODEL URL — streams POST /api/pull into a byte-accurate progress bar
api_pull_with_bar() {
  local m="$1" url="$2" title line status="" err="" ok=false rc=0
  local d tc tt pct=0 shown=-1 start=$SECONDS now last_draw=-1 prev_c=0 prev_t=$SECONDS speed="" detail
  local -A tot=() cmp=()
  local rcfile
  rcfile=$(mktemp)
  title="Pulling ${m}"
  log_line "RUN api pull ${m} via ${url}"
  draw_bar "$title" 0 "starting"
  while IFS= read -r line; do
    [[ "$line" =~ \"error\":\"([^\"]*)\" ]] && err="${BASH_REMATCH[1]}"
    [[ "$line" =~ \"status\":\"([^\"]*)\" ]] && status="${BASH_REMATCH[1]}"
    [[ "$status" == "success" ]] && ok=true
    if [[ "$line" =~ \"digest\":\"([^\"]+)\" ]]; then
      d="${BASH_REMATCH[1]}"
      if [[ "$line" =~ \"total\":([0-9]+) ]]; then tot[$d]="${BASH_REMATCH[1]}"; fi
      if [[ "$line" =~ \"completed\":([0-9]+) ]]; then cmp[$d]="${BASH_REMATCH[1]}"; fi
    fi
    tt=0; tc=0
    for d in "${!tot[@]}"; do tt=$((tt + ${tot[$d]})); tc=$((tc + ${cmp[$d]:-0})); done
    if (( tt > 0 )); then pct=$(( tc * 100 / tt )); (( pct < shown )) && pct=$shown; fi
    now=$SECONDS
    if (( pct != shown || now != last_draw )); then
      if (( now > prev_t && tc > prev_c )); then
        speed="$(( (tc - prev_c) / (now - prev_t) / 1048576 )) MB/s"; prev_c=$tc; prev_t=$now
      fi
      shown=$pct; last_draw=$now
      if (( tt > 0 )); then detail="$(human_bytes "$tc")/$(human_bytes "$tt")${speed:+  $speed}"; else detail="$status"; fi
      draw_bar "$title" "$pct" "$detail"
    fi
  done < <( { curl -sN --connect-timeout 10 -X POST "${url}/api/pull" \
                -d "{\"model\":\"${m}\",\"name\":\"${m}\",\"stream\":true}" 2>&1 \
              && echo 0 >"$rcfile" || echo $? >"$rcfile"; } )
  rc=$(cat "$rcfile" 2>/dev/null || echo 1)
  rm -f "$rcfile"
  end_bar
  if $ok && [[ -z "$err" && "$rc" -eq 0 ]]; then
    p_ok "${title} ($(fmt_elapsed $((SECONDS - start))))"
    return 0
  fi
  p_err "Pull of ${m} failed${err:+: ${err}}"
  return 1
}

# ── Validation helpers ────────────────────────────────────────
validate_url()   { [[ "$1" =~ ^https?://[^[:space:]]+[^/]$ ]]; }
validate_email() { [[ "$1" =~ ^[^@]+@[^@]+\.[^@]+$ ]]; }
validate_model() { [[ "$1" =~ ^[A-Za-z0-9._:/@-]+$ ]]; }
is_ipv4()        { [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; }
validate_host()  { is_ipv4 "$1" || [[ "$1" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ ]]; }

# version_ge A B → 0 when A >= B
version_ge() { [[ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -1)" == "$2" ]]; }

# ── Release channel helpers ───────────────────────────────────
# Pre-release tags (v1.2.0-beta.1) belong to the "beta" channel. Stable installs
# never see them; an install already on a pre-release tag (or LEKSIS_CHANNEL=beta)
# follows the beta channel.

# detect_channel <tag> → prints "beta" or "stable"
detect_channel() {
  if [[ "${LEKSIS_CHANNEL:-}" == "beta" || "$1" == *-* ]]; then
    echo "beta"
  else
    echo "stable"
  fi
}

# latest_tag <repo_dir> <stable|beta> → highest semver tag for the channel (empty if none)
latest_tag() {
  local dir="$1" channel="${2:-stable}" tags
  tags=$(git -C "$dir" -c versionsort.suffix=- tag --list 'v[0-9]*' --sort=-v:refname 2>/dev/null || true)
  if [[ "$channel" == "beta" ]]; then
    head -1 <<<"$tags" || true
  else
    { grep -v -- '-' <<<"$tags" || true; } | head -1
  fi
}

# current_ref → exact tag of HEAD, or short commit
current_ref() {
  git -C "$INSTALL_DIR" describe --tags --exact-match HEAD 2>/dev/null \
    || git -C "$INSTALL_DIR" rev-parse --short HEAD 2>/dev/null || echo "unknown"
}

# ── Package manager ───────────────────────────────────────────
detect_pkg_manager() {
  if   command -v apt-get &>/dev/null; then PKG_MGR="apt"
  elif command -v dnf     &>/dev/null; then PKG_MGR="dnf"
  elif command -v yum     &>/dev/null; then PKG_MGR="yum"
  else PKG_MGR=""; fi
}

pkg_install() {
  case "$PKG_MGR" in
    apt)
      if ! $APT_UPDATED; then apt-get update -qq >/dev/null 2>&1 || true; APT_UPDATED=true; fi
      DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "$@" ;;
    dnf) dnf install -y -q "$@" ;;
    yum) yum install -y -q "$@" ;;
    *)   return 1 ;;
  esac
}

check_root() {
  if [[ $EUID -ne 0 ]]; then
    p_err "This script must be run as root (or with sudo)."
    p_err "Please re-run:  sudo ./install.sh"
    exit 1
  fi
}

# Base tools needed by every command (silent when already present)
ensure_base_deps() {
  local missing=()
  command -v git       &>/dev/null || missing+=("git")
  command -v openssl   &>/dev/null || missing+=("openssl")
  command -v curl      &>/dev/null || missing+=("curl")
  command -v tar       &>/dev/null || missing+=("tar")
  command -v sha256sum &>/dev/null || missing+=("coreutils")
  if [[ ${#missing[@]} -gt 0 ]]; then
    p_spin "Installing system packages: ${missing[*]}" pkg_install "${missing[@]}" \
      || die "Could not install: ${missing[*]}. Install them manually and re-run."
  fi
}

ensure_lspci() {
  command -v lspci &>/dev/null && return 0
  pkg_install pciutils >/dev/null 2>&1 || true
}

# ── TUI (gum) ─────────────────────────────────────────────────
# Downloads a pinned, checksum-verified gum binary. Any failure falls back to
# the plain-text prompts — the installer never depends on it.
ensure_gum() {
  $NONINTERACTIVE && return 0
  $NO_TUI && return 0
  [[ "${LEKSIS_NO_TUI:-}" == "1" ]] && return 0
  $TTY_OK || return 0
  [[ "${TERM:-dumb}" == "dumb" ]] && return 0
  if command -v gum &>/dev/null; then USE_GUM=true; return 0; fi
  [[ "$(uname -s)" == "Linux" ]] || return 0

  local asset sha tmp url
  case "$(uname -m)" in
    x86_64|amd64)  asset="Linux_x86_64"; sha="$GUM_SHA256_AMD64" ;;
    aarch64|arm64) asset="Linux_arm64";  sha="$GUM_SHA256_ARM64" ;;
    *) return 0 ;;
  esac
  url="https://github.com/charmbracelet/gum/releases/download/v${GUM_VERSION}/gum_${GUM_VERSION}_${asset}.tar.gz"
  tmp=$(mktemp -d)
  p_info "Downloading the terminal UI (gum ${GUM_VERSION})..."
  if curl -fsSL --connect-timeout 10 --max-time 90 "$url" -o "${tmp}/gum.tgz" \
     && echo "${sha}  ${tmp}/gum.tgz" | sha256sum -c --status - \
     && tar -xzf "${tmp}/gum.tgz" -C "$tmp" \
     && install -m 0755 "$(find "$tmp" -type f -name gum | head -1)" /usr/local/bin/gum; then
    USE_GUM=true
  else
    p_warn "Terminal UI unavailable — using plain-text prompts."
  fi
  rm -rf "$tmp"
}

# ── Env file helpers ──────────────────────────────────────────
# env_get FILE KEY → value ("" when absent) — never sources the file
env_get() {
  { grep -m1 "^${2}=" "$1" 2>/dev/null || true; } | cut -d= -f2-
}

# _env_set KEY VALUE FILE — replaces the key, or appends it when absent
_env_set() {
  local key="$1" value="$2" file="$3" tmp
  tmp=$(mktemp)
  K="$key" V="$value" awk 'BEGIN { FS = "="; k = ENVIRON["K"]; v = ENVIRON["V"] }
    $1 == k && !done { print k "=" v; done = 1; next }
    { print }
    END { if (!done) print k "=" v }' "$file" >"$tmp"
  cat "$tmp" >"$file"
  rm -f "$tmp"
}

# load_answers_file FILE — imports LEKSIS_* lines (existing env vars win)
load_answers_file() {
  local line k v
  [[ -f "$1" ]] || die "Answers file not found: $1"
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^[[:space:]]*(#|$) ]] && continue
    if [[ "$line" =~ ^(LEKSIS_[A-Z0-9_]+)=(.*)$ ]]; then
      k="${BASH_REMATCH[1]}"; v="${BASH_REMATCH[2]}"
      if [[ -z "${!k+x}" ]]; then export "${k}=${v}"; fi
    fi
  done <"$1"
  map_answer_aliases
  return 0
}

# alias_answer NEW OLD — LEKSIS_<NEW> defaults to LEKSIS_<OLD> (answer keys renamed in v1.2)
alias_answer() {
  local new="LEKSIS_$1" old="LEKSIS_$2"
  if [[ -z "${!new+x}" && -n "${!old+x}" ]]; then export "${new}=${!old}"; fi
  return 0
}
map_answer_aliases() {
  alias_answer AI_MODE OLLAMA_MODE
  alias_answer AI_URL  OLLAMA_URL
}

# ── Docker ────────────────────────────────────────────────────
install_docker() {
  if command -v docker &>/dev/null && docker compose version &>/dev/null 2>&1; then
    p_ok "Docker $(docker --version | cut -d' ' -f3 | tr -d ',') with Compose v2 already installed."
  else
    p_info "Downloading and running Docker installer from get.docker.com..."
    curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
    run_logged sh /tmp/get-docker.sh
    rm -f /tmp/get-docker.sh
    systemctl enable docker 2>/dev/null || true
    systemctl start  docker 2>/dev/null || true
    sleep 3
    if ! docker compose version &>/dev/null 2>&1; then
      p_info "Installing docker-compose-plugin..."
      pkg_install docker-compose-plugin >/dev/null 2>&1 \
        || pkg_install docker-compose >/dev/null 2>&1 || true
      sleep 2
    fi
  fi
  docker compose version &>/dev/null 2>&1 \
    || die "Docker Compose v2 could not be installed. Please install it manually and re-run."

  local v
  v=$(docker compose version --short 2>/dev/null | sed 's/^v//' || true)
  if [[ -z "$v" ]] || ! version_ge "$v" "$MIN_COMPOSE_VERSION"; then
    p_info "Docker Compose ${v:-unknown} is older than ${MIN_COMPOSE_VERSION} — trying to upgrade..."
    pkg_install docker-compose-plugin >/dev/null 2>&1 || true
    v=$(docker compose version --short 2>/dev/null | sed 's/^v//' || true)
    if [[ -z "$v" ]] || ! version_ge "$v" "$MIN_COMPOSE_VERSION"; then
      die "Docker Compose >= ${MIN_COMPOSE_VERSION} is required (found ${v:-none}). Upgrade it and re-run."
    fi
  fi
}

has_nvidia_runtime() {
  local info
  info=$(docker info 2>/dev/null || true)
  [[ "$info" == *nvidia* ]]
}

# ── GPU detection (multi-vendor) ──────────────────────────────
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
      GPU_VENDOR="nvidia"; GPU_NAME="NVIDIA GPU"
    elif lsmod | grep -q "^amdgpu "; then
      GPU_VENDOR="amd"; GPU_NAME="AMD GPU"
    fi
  fi

  # 5. rocm-smi
  if [[ -z "$GPU_VENDOR" ]] && command -v rocm-smi &>/dev/null; then
    GPU_VENDOR="amd"
  fi
}

gpu_label() {
  case "${GPU_VENDOR:-}" in
    nvidia) echo "NVIDIA GPU${GPU_NAME:+: ${GPU_NAME}}" ;;
    amd)    echo "AMD GPU${GPU_NAME:+: ${GPU_NAME}}" ;;
    *)      echo "CPU-only mode" ;;
  esac
}

# select_gpu — detection + manual fallback (answer LEKSIS_GPU_VENDOR=nvidia|amd|none)
select_gpu() {
  local preset
  if preset=$(p_preset GPU_VENDOR); then
    case "$preset" in nvidia|amd) GPU_VENDOR="$preset" ;; *) GPU_VENDOR="" ;; esac
    GPU_NAME=""
    p_ok "GPU: $(gpu_label)"
    return 0
  fi
  ensure_lspci
  detect_gpu

  # Manual fallback: lspci sees a GPU but auto-detection failed
  if [[ -z "$GPU_VENDOR" ]]; then
    local hint
    hint=$(lspci 2>/dev/null | grep -iE "nvidia|radeon|amd" | head -3 || true)
    if [[ -n "$hint" ]]; then
      p_warn "GPU hardware detected by lspci but vendor could not be identified automatically:"
      while IFS= read -r l; do say "    $l"; done <<<"$hint"
      if p_yesno GPU_IS_NVIDIA "Is this an NVIDIA GPU?" "y"; then
        GPU_VENDOR="nvidia"
        GPU_NAME=$(head -1 <<<"$hint" | sed 's/.*\[//' | sed 's/\].*//' || true)
      elif p_yesno GPU_IS_AMD "Is this an AMD GPU?" "n"; then
        GPU_VENDOR="amd"
        GPU_NAME=$(head -1 <<<"$hint" | sed 's/.*: //' || true)
      fi
    fi
  fi
  p_ok "GPU: $(gpu_label)"
}

# ── GPU toolkit installation ──────────────────────────────────
NVIDIA_DRIVER_VERSION="580.142"
NVIDIA_DRIVER_SHA256="20915fcf3ffe89c3550cf93b60a04a285453150d92e2468e1911a43620447563"
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

  p_spin "Installing kernel build dependencies" \
    apt-get install -y build-essential dkms "linux-headers-$(uname -r)" pkg-config libglvnd-dev \
    || die "Could not install the kernel build dependencies."

  local nouveau_conf="/etc/modprobe.d/blacklist-nouveau.conf"
  if [[ ! -f "$nouveau_conf" ]]; then
    p_info "Blacklisting nouveau driver..."
    tee "$nouveau_conf" >/dev/null <<'EOF'
blacklist nouveau
options nouveau modeset=0
EOF
    update-initramfs -u >/dev/null 2>&1 || true
    p_warn "Nouveau has been blacklisted. A reboot is required to unload it."
    p_warn "Your answers are saved. Reboot, then re-run the installer to resume:"
    p_warn "  sudo reboot"
    exit 0
  fi

  # After reboot: confirm nouveau is fully unloaded (lsmod + sysfs)
  if lsmod | grep -q "nouveau" || ls /sys/bus/pci/drivers/nouveau/ 2>/dev/null | grep -q "."; then
    p_warn "The nouveau driver is still active after reboot."
    p_warn "Please reboot again and re-run the installer to resume:"
    p_warn "  sudo reboot"
    exit 0
  fi

  if [[ -f "$NVIDIA_DRIVER_RUN" ]] && ! echo "${NVIDIA_DRIVER_SHA256}  ${NVIDIA_DRIVER_RUN}" | sha256sum -c --status -; then
    rm -f "$NVIDIA_DRIVER_RUN"
  fi
  if [[ ! -f "$NVIDIA_DRIVER_RUN" ]]; then
    p_info "Downloading NVIDIA driver ${NVIDIA_DRIVER_VERSION} (~400 MB)..."
    curl -fL --progress-bar "$NVIDIA_DRIVER_URL" -o "$NVIDIA_DRIVER_RUN" || die "NVIDIA driver download failed."
  fi
  if ! echo "${NVIDIA_DRIVER_SHA256}  ${NVIDIA_DRIVER_RUN}" | sha256sum -c --status -; then
    rm -f "$NVIDIA_DRIVER_RUN"
    die "NVIDIA driver checksum mismatch — file removed. Re-run the installer to download it again."
  fi
  p_ok "NVIDIA driver checksum verified."
  chmod +x "$NVIDIA_DRIVER_RUN"

  p_info "Installing NVIDIA driver ${NVIDIA_DRIVER_VERSION} (this may take 10-15 minutes)..."
  p_info "Compiling kernel module via DKMS — do not interrupt..."
  "$NVIDIA_DRIVER_RUN" --dkms --no-questions --accept-license 2>&1 | tee /var/log/nvidia-install.log
}

_install_nvidia_toolkit() {
  if has_nvidia_runtime; then
    p_ok "nvidia-container-toolkit already configured."
    return 0
  fi

  p_info "Installing nvidia-container-toolkit..."
  command -v gpg &>/dev/null || pkg_install gnupg2 >/dev/null 2>&1
  curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
    | gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
  curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
    | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
    | tee /etc/apt/sources.list.d/nvidia-container-toolkit.list >/dev/null
  apt-get update -qq
  run_logged apt-get install -y nvidia-container-toolkit
  nvidia-ctk runtime configure --runtime=docker
  systemctl restart docker
  p_ok "nvidia-container-toolkit installed."
}

_install_amd_rocm() {
  local info
  info=$(docker info 2>/dev/null || true)
  if [[ "$info" == *rocm* || "$info" == *amdgpu* ]]; then
    p_ok "ROCm already configured."
    return 0
  fi
  local codename
  codename=$(. /etc/os-release 2>/dev/null && echo "${UBUNTU_CODENAME:-jammy}" || echo jammy)
  p_info "Installing AMD ROCm..."
  curl -fsSL \
    "https://repo.radeon.com/amdgpu-install/latest/ubuntu/${codename}/amdgpu-install_6.3.60300-1_all.deb" \
    -o /tmp/amdgpu-install.deb
  pkg_install /tmp/amdgpu-install.deb
  run_logged amdgpu-install -y --usecase=rocm --no-dkms
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

# resolve_compose_files — sets COMPOSE_FILE_VALUE + OLLAMA_IMAGE from the GPU
# (local Ollama only; a remote Ollama needs no GPU overlay)
resolve_compose_files() {
  COMPOSE_FILE_VALUE="docker-compose.yml"
  OLLAMA_IMAGE="ollama/ollama:latest"
  [[ "$OLLAMA_MODE" == "local" ]] || return 0
  case "${GPU_VENDOR:-}" in
    nvidia) has_nvidia_runtime && COMPOSE_FILE_VALUE="docker-compose.yml:docker-compose.nvidia.yml" ;;
    amd)    COMPOSE_FILE_VALUE="docker-compose.yml:docker-compose.amd.yml"; OLLAMA_IMAGE="ollama/ollama:rocm" ;;
  esac
  return 0
}

# ── Installation lookup ───────────────────────────────────────
# resolve_install_dir — --dir/LEKSIS_INSTALL_DIR → /etc/leksis/install.conf →
# /opt/leksis → ask
resolve_install_dir() {
  local d
  if d=$(p_preset INSTALL_DIR) && [[ -n "$d" ]]; then INSTALL_DIR="$d"; return 0; fi
  if [[ -f "$INSTALL_CONF" ]]; then
    d=$(env_get "$INSTALL_CONF" INSTALL_DIR)
    if [[ -n "$d" && -f "$d/.env" ]]; then INSTALL_DIR="$d"; return 0; fi
  fi
  if [[ -f "${DEFAULT_INSTALL_DIR}/.env" ]]; then INSTALL_DIR="$DEFAULT_INSTALL_DIR"; return 0; fi
  INSTALL_DIR=$(p_input INSTALL_DIR "Installation directory" "$DEFAULT_INSTALL_DIR")
}

ollama_local_enabled() {
  local p
  p=$(env_get "${INSTALL_DIR}/.env" COMPOSE_PROFILES)
  [[ ",${p}," == *",ollama,"* ]]
}

# load_config_from_env — fills the OLLAMA_* / mode globals from the installed .env
load_config_from_env() {
  local env="${INSTALL_DIR}/.env" v provider
  provider=$(env_get "$env" AI_PROVIDER)
  AI_API_KEY=$(env_get "$env" AI_API_KEY)
  if [[ "$provider" == "openai" ]]; then
    OLLAMA_MODE="openai"; OLLAMA_URL=$(env_get "$env" AI_BASE_URL)
  elif ollama_local_enabled; then
    OLLAMA_MODE="local"; OLLAMA_URL="http://ollama:11434"
  else
    OLLAMA_MODE="remote"
    OLLAMA_URL=$(env_get "$env" AI_BASE_URL)
    [[ -n "$OLLAMA_URL" ]] || OLLAMA_URL=$(env_get "$env" OLLAMA_BASE_URL)
  fi
  # host.docker.internal only resolves inside containers — test it as localhost from here
  OLLAMA_URL_HOSTSIDE="${OLLAMA_URL/host.docker.internal/localhost}"
  v=$(env_get "$env" OLLAMA_MODEL);             OLLAMA_MODEL="${v:-$DEFAULT_MODEL}"
  v=$(env_get "$env" OLLAMA_OCR_MODEL);          OLLAMA_OCR_MODEL="${v:-$DEFAULT_OCR_MODEL}"
  v=$(env_get "$env" OLLAMA_REWRITE_MODEL);      OLLAMA_REWRITE_MODEL="${v:-$DEFAULT_REWRITE_MODEL}"
  v=$(env_get "$env" OLLAMA_KEEP_ALIVE);         OLLAMA_KEEP_ALIVE="${v:--1}"
  v=$(env_get "$env" OLLAMA_SCHED_SPREAD);       OLLAMA_SCHED_SPREAD="${v:-true}"
  v=$(env_get "$env" OLLAMA_MAX_LOADED_MODELS);  OLLAMA_MAX_LOADED_MODELS="${v:-3}"
}

# migrate_env — upgrades a .env written by an older install.sh
migrate_env() {
  local env="${INSTALL_DIR}/.env" url
  # Guard: preserve existing postgres major version
  if ! grep -q "^POSTGRES_VERSION=" "$env"; then
    printf '\n# PostgreSQL version -- preserved by update guard (existing data on v16)\nPOSTGRES_VERSION=16\n' >>"$env"
    p_warn "POSTGRES_VERSION=16 has been added to your .env to preserve your existing database."
    p_warn "To upgrade to a newer PostgreSQL major version, update POSTGRES_VERSION in .env"
    p_warn "and perform a data migration first (pg_upgrade or pg_dump / pg_restore)."
  fi
  # Ollama is now an optional compose profile: installs from before that always had it
  if ! grep -q "^COMPOSE_PROFILES=" "$env"; then
    url=$(env_get "$env" OLLAMA_BASE_URL)
    if [[ -z "$url" || "$url" == "http://ollama:11434" ]]; then
      _env_set COMPOSE_PROFILES "ollama" "$env"
      p_info "Migrated .env: local Ollama container kept (COMPOSE_PROFILES=ollama)."
    else
      _env_set COMPOSE_PROFILES "" "$env"
      p_info "Migrated .env: remote Ollama at ${url}."
    fi
  fi
  # Multi-provider AI engine (Ollama or OpenAI-compatible API): explicit provider + generic URL / key
  if ! grep -q "^AI_PROVIDER=" "$env"; then
    url=$(env_get "$env" OLLAMA_BASE_URL)
    _env_set AI_PROVIDER "ollama" "$env"
    _env_set AI_BASE_URL "${url:-http://ollama:11434}" "$env"
    _env_set AI_API_KEY "" "$env"
    p_info "Migrated .env: AI_PROVIDER=ollama."
  fi
  # 1.5.0-beta.* named the OpenAI-compatible provider "vllm": back to the generic id
  if [[ "$(env_get "$env" AI_PROVIDER)" == "vllm" ]]; then
    _env_set AI_PROVIDER "openai" "$env"
    p_info "Migrated .env: AI_PROVIDER=vllm -> openai."
  fi
}

# clear_pinned_url — empties NEXTAUTH_URL in .env. Auth.js forces every redirect to that address, which
# defeats the automatic detection (wrong host behind a reverse proxy, HTTP kept after switching to HTTPS).
clear_pinned_url() {
  _env_set NEXTAUTH_URL "" "${INSTALL_DIR}/.env"
}

# migrate_pinned_url → 0 when an IP-based NEXTAUTH_URL (the old installer default, e.g. http://192.168.1.50)
# was removed: it would send users to the IP even when they come through a domain or a reverse proxy.
# A domain-based value keeps working and is left alone (`leksis config` can still clear it).
migrate_pinned_url() {
  local pin
  pin=$(env_get "${INSTALL_DIR}/.env" NEXTAUTH_URL)
  if [[ "$pin" =~ ^https?://[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+(:[0-9]+)?/?$ ]]; then
    clear_pinned_url
    p_info "Migrated .env: NEXTAUTH_URL (${pin}) removed — the public address is now detected automatically."
    return 0
  fi
  return 1
}

# require_install — locates the installation, cd's into it, migrates .env
require_install() {
  resolve_install_dir
  if [[ ! -f "${INSTALL_DIR}/.env" ]]; then
    die "Leksis does not appear to be installed at: ${INSTALL_DIR} (.env not found)"
  fi
  INSTALL_DIR="$(cd "$INSTALL_DIR" && pwd)"
  cd "$INSTALL_DIR"
  migrate_env
  load_config_from_env
}

# ── Docker project helpers ────────────────────────────────────
compose_project() {
  local p
  p=$(env_get "${INSTALL_DIR}/.env" COMPOSE_PROJECT_NAME)
  [[ -z "$p" ]] && p=$(docker inspect leksis-app --format '{{index .Config.Labels "com.docker.compose.project"}}' 2>/dev/null || true)
  echo "${p:-leksis}"
}

# project_volumes → volume names of this compose project (one per line)
project_volumes() {
  docker volume ls -q --filter "label=com.docker.compose.project=$(compose_project)" 2>/dev/null || true
}

show_volumes_info() {
  local vol mp found=false
  while IFS= read -r vol; do
    [[ -z "$vol" ]] && continue
    found=true
    mp=$(docker volume inspect "$vol" --format='{{.Mountpoint}}' 2>/dev/null || echo "")
    if [[ -n "$mp" ]]; then
      printf '  %-34s  %s\n' "$vol" "$(du -sh "$mp" 2>/dev/null | cut -f1 || echo '?')" >&3
    else
      printf '  %-34s  %s\n' "$vol" "(unknown size)" >&3
    fi
  done < <(project_volumes)
  $found || say "  (no volumes found)"
}

services_list() {
  if ollama_local_enabled; then echo "postgres ollama app caddy"; else echo "postgres app caddy"; fi
}

wait_healthy() {
  local service="$1" max_wait="${2:-180}" elapsed=0 status state
  while [[ $elapsed -lt $max_wait ]]; do
    status=$(docker inspect --format='{{.State.Health.Status}}' "leksis-${service}" 2>/dev/null || echo "")
    if [[ "$status" == "healthy" ]]; then
      $TTY_OK && printf '\r%80s\r' '' >&3
      p_ok "${service} is healthy."
      return 0
    fi
    state=$(docker inspect --format='{{.State.Status}}' "leksis-${service}" 2>/dev/null || echo "")
    if [[ "$state" == "exited" || "$state" == "dead" ]]; then
      $TTY_OK && printf '\r%80s\r' '' >&3
      p_err "${service} stopped unexpectedly. Last log lines:"
      docker logs --tail 15 "leksis-${service}" 2>&1 | sed 's/^/      /' >&3 || true
      return 1
    fi
    if $TTY_OK; then
      printf '\r  %s-->%s Waiting for %s to be healthy... (%ds / %ds)' \
        "$C_DIM" "$C_RESET" "$service" "$elapsed" "$max_wait" >&3
    elif (( elapsed % 30 == 0 )); then
      p_info "Waiting for ${service}... (${elapsed}s / ${max_wait}s)"
    fi
    sleep 5
    elapsed=$((elapsed + 5))
  done
  $TTY_OK && printf '\r%80s\r' '' >&3
  p_warn "${service} did not become healthy within ${max_wait}s."
  p_warn "Check logs with:  leksis logs ${service}"
  return 1
}

# check_app_http — tests the public entry point through Caddy (2xx/3xx = OK)
check_app_http() {
  local host code i
  host=$(env_get "${INSTALL_DIR}/.env" CADDY_HOST)
  host="${host#:}"
  [[ "$host" == "80" ]] && host=""
  for i in 1 2 3 4 5 6; do
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 \
      ${host:+-H "Host: ${host}"} http://127.0.0.1/ 2>/dev/null || true)
    if [[ "$code" =~ ^[23][0-9][0-9]$ ]]; then
      p_ok "Application answers on http://127.0.0.1/ (HTTP ${code})."
      return 0
    fi
    sleep 5
  done
  p_warn "The application did not answer through Caddy (last HTTP code: ${code:-none})."
  p_warn "Check:  leksis logs app   /   leksis logs caddy"
  return 1
}

# ── Preflight checks ──────────────────────────────────────────
port_in_use() {
  ss -ltn 2>/dev/null | awk -v p=":$1" '$4 ~ p"$" { f = 1 } END { exit !f }'
}

preflight_system() {
  local os_id os_ver os_name ram_gb cpus arch
  os_id=$(. /etc/os-release 2>/dev/null && echo "${ID:-unknown}" || echo unknown)
  os_ver=$(. /etc/os-release 2>/dev/null && echo "${VERSION_ID:-}" || echo "")
  os_name=$(. /etc/os-release 2>/dev/null && echo "${PRETTY_NAME:-unknown}" || echo unknown)
  ram_gb=$(awk '/^MemTotal:/ { print int($2 / 1024 / 1024) }' /proc/meminfo 2>/dev/null || echo 0)
  cpus=$(nproc 2>/dev/null || echo 1)
  arch=$(uname -m)

  p_header "System check"
  case "${os_id}:${os_ver}" in
    ubuntu:22.04|ubuntu:24.04|debian:12|debian:13) p_ok "OS: ${os_name}" ;;
    *) p_warn "OS: ${os_name} is not one of the tested systems (Ubuntu 22.04/24.04, Debian 12/13)." ;;
  esac
  p_ok "Architecture: ${arch}"
  if (( cpus >= 4 )); then p_ok "CPU: ${cpus} cores"; else p_warn "CPU: ${cpus} core(s) — 4 or more recommended."; fi
  if (( ram_gb >= 8 )); then
    p_ok "RAM: ${ram_gb} GB"
  else
    p_warn "RAM: ${ram_gb} GB — 8 GB minimum (16 GB recommended for local LLM inference)."
    if (( ram_gb < 4 )); then
      p_yesno CONTINUE_LOW_RAM "Less than 4 GB of RAM: continue anyway?" "n" || { p_info "Installation aborted."; exit 0; }
    fi
  fi
}

# preflight_disk local|remote
preflight_disk() {
  local need=15 target free
  [[ "$1" == "local" ]] && need=40
  target="/var/lib/docker"; [[ -d "$target" ]] || target="/var/lib"
  free=$(df -P -BG "$target" 2>/dev/null | awk 'NR == 2 { gsub("G", "", $4); print $4 }' || echo 0)
  free="${free:-0}"
  if (( free >= need )); then
    p_ok "Disk: ${free} GB free on ${target} (${need} GB needed)."
  else
    p_warn "Disk: only ${free} GB free on ${target} — ${need} GB recommended."
    p_yesno CONTINUE_LOW_DISK "Continue anyway?" "n" || { p_info "Installation aborted."; exit 0; }
  fi
}

# preflight_network host
preflight_network() {
  local host="$1" port
  if ! is_ipv4 "$host" && [[ "$host" != ":80" && "$host" != "localhost" ]]; then
    if getent hosts "$host" >/dev/null 2>&1; then
      p_ok "DNS: ${host} resolves. Ports 80/443 must be reachable from the internet for Let's Encrypt."
    else
      p_warn "DNS: ${host} does not resolve from this server — HTTPS certificates cannot be issued until it does."
    fi
  fi
  if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^leksis-caddy$'; then
    for port in 80 443; do
      if port_in_use "$port"; then
        p_warn "Port ${port} is already in use on this server."
        p_yesno "CONTINUE_PORT_${port}" "Continue anyway?" "n" || { p_info "Installation aborted."; exit 0; }
      fi
    done
  fi
}

# ── Ollama helpers ────────────────────────────────────────────
# normalize_ollama_url RAW → http(s)://host[:port] without trailing slash
normalize_ollama_url() {
  local u="$1"
  u="${u%"${u##*[![:space:]]}"}"; u="${u#"${u%%[![:space:]]*}"}"
  [[ "$u" =~ ^https?:// ]] || u="http://${u}"
  while [[ "$u" == */ ]]; do u="${u%/}"; done
  [[ "$u" =~ ^http://[^/:]+$ ]] && u="${u}:11434"
  printf '%s' "$u"
}

# normalize_openai_url RAW → base URL of an OpenAI-compatible API ("http://host:8000" → ".../v1")
normalize_openai_url() {
  local u="$1"
  u="${u%"${u##*[![:space:]]}"}"; u="${u#"${u%%[![:space:]]*}"}"
  [[ "$u" =~ ^https?:// ]] || u="http://${u}"
  while [[ "$u" == */ ]]; do u="${u%/}"; done
  [[ "$u" =~ ^https?://[^/]+$ ]] && u="${u}/v1"
  printf '%s' "$u"
}

# openai_models URL [KEY] → served model ids, one per line; returns 1 when unreachable
openai_models() {
  local out
  out=$(curl -fsS --max-time 10 ${2:+-H "Authorization: Bearer $2"} "${1}/models" 2>/dev/null) || return 1
  { grep -oE '"id"[[:space:]]*:[[:space:]]*"[^"]*"' <<<"$out" \
    | sed -E 's/.*:[[:space:]]*"([^"]*)"/\1/' | grep -v '^modelperm-'; } || true
}

# host_looks_private URL → 0 when the host is on a private network (Leksis blocks the others by default)
host_looks_private() {
  local h="${1#*://}"
  h="${h%%/*}"; h="${h%%:*}"
  if is_ipv4 "$h"; then
    [[ "$h" =~ ^(10\.|127\.|192\.168\.|169\.254\.) ]] && return 0
    [[ "$h" =~ ^172\.(1[6-9]|2[0-9]|3[01])\. ]] && return 0
    [[ "$h" =~ ^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\. ]] && return 0
    return 1
  fi
  [[ "$h" != *.* ]] && return 0
  [[ "$h" =~ \.(local|lan|internal|home\.arpa|localdomain)$ ]] && return 0
  return 1
}

# ollama_version URL → version string, returns 1 when unreachable
ollama_version() {
  local out
  out=$(curl -fsS --max-time 8 "${1}/api/version" 2>/dev/null) || return 1
  sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' <<<"$out"
}

# list_models → installed model names, one per line (local container or remote server)
list_models() {
  if [[ "$OLLAMA_MODE" == "openai" ]]; then
    openai_models "${OLLAMA_URL_HOSTSIDE:-$OLLAMA_URL}" "$AI_API_KEY" || true
  elif [[ "$OLLAMA_MODE" == "local" ]]; then
    docker compose exec -T ollama ollama list 2>/dev/null | awk 'NR > 1 { print $1 }' || true
  else
    { curl -fsS --max-time 10 "${OLLAMA_URL_HOSTSIDE:-$OLLAMA_URL}/api/tags" 2>/dev/null \
      | grep -o '"name":"[^"]*"' | cut -d'"' -f4; } || true
  fi
}

model_present() {
  local m="$1"
  # "qwen2.5" and "qwen2.5:latest" are the same Ollama model; OpenAI-style ids are exact
  if [[ "$OLLAMA_MODE" != "openai" && "$m" != *:* ]]; then m="${m}:latest"; fi
  grep -Fxq -- "$m" <<<"$2"
}

pull_model() {
  local m="$1" url
  # Both modes go through the Ollama API so the download shows a real progress bar
  # (the local container's IP is routable from the Docker host).
  url=$(ollama_api_url)
  if [[ -n "$url" ]] && ollama_version "$url" >/dev/null 2>&1; then
    api_pull_with_bar "$m" "$url"
    return
  fi
  if [[ "$OLLAMA_MODE" == "local" ]]; then
    p_info "Pulling model: ${m} (this may take a while)..."
    log_line "RUN ollama pull ${m}"
    docker compose exec -T ollama ollama pull "$m"
  else
    p_err "Ollama server not reachable at ${url:-?} — cannot pull ${m}."
    return 1
  fi
}

# ensure_models — pulls the configured models that are missing (failures are collected)
ensure_models() {
  local models m present
  local -a missing=()
  models=$(printf '%s\n' "$OLLAMA_MODEL" "$OLLAMA_OCR_MODEL" "$OLLAMA_REWRITE_MODEL" | awk 'NF && !seen[$0]++')
  present=$(list_models)

  # OpenAI-compatible API: models are loaded by the server — check only, never pull
  if [[ "$OLLAMA_MODE" == "openai" ]]; then
    if [[ -z "$present" ]]; then
      p_warn "Could not list the models served by the API — skipping the model check."
      return 0
    fi
    while IFS= read -r m; do
      if model_present "$m" "$present"; then p_ok "Model served by the API: ${m}"
      else p_warn "Model not served by the API: ${m} — available: $(tr '\n' ' ' <<<"$present")"; fi
    done <<<"$models"
    return 0
  fi

  if [[ "$OLLAMA_MODE" == "remote" && -z "$present" ]]; then
    p_warn "Could not list the models of the remote Ollama server — skipping model check."
    return 0
  fi
  while IFS= read -r m; do
    if model_present "$m" "$present"; then p_ok "Model already present: ${m}"; else missing+=("$m"); fi
  done <<<"$models"
  [[ ${#missing[@]} -eq 0 ]] && return 0

  if [[ "$OLLAMA_MODE" == "remote" ]]; then
    p_warn "Missing on the remote server: ${missing[*]}"
    p_yesno PULL_REMOTE_MODELS "Pull them now on the remote Ollama server?" "y" || return 0
  fi
  for m in "${missing[@]}"; do
    if pull_model "$m" && model_present "$m" "$(list_models)"; then
      p_ok "Model pulled: ${m}"
    else
      p_warn "Could not pull model: ${m}"
      FAILED_MODELS+=("$m")
    fi
  done
  return 0
}

# sync_ai_config_db [yes] — the admin panel (Services → AI) keeps its own AI config in site_settings
# (ai_config, or the older ollama_config) and it takes precedence over .env once saved: keep it in
# sync after `leksis config`. With "yes" the stored (encrypted) API key is cleared so the AI_API_KEY
# of .env applies. Nothing to do when the admin panel never saved a config.
sync_ai_config_db() {
  local wipe="${1:-no}" exists url="$OLLAMA_URL" provider="ollama" same="${SAME_MODEL_FOR_ALL:-}"
  [[ "$OLLAMA_MODE" == "local" ]] && url="http://ollama:11434"
  [[ "$OLLAMA_MODE" == "openai" ]] && provider="openai"
  exists=$(docker compose exec -T postgres psql -U leksis_user -d leksis -tAc \
    "SELECT 1 FROM site_settings WHERE key IN ('ai_config', 'ollama_config') LIMIT 1" 2>/dev/null | tr -d '[:space:]' || true)
  [[ "$exists" == "1" ]] || return 0
  if docker compose exec -T postgres psql -U leksis_user -d leksis -q -v ON_ERROR_STOP=1 \
      -v provider="$provider" -v url="$url" -v tm="$OLLAMA_MODEL" -v om="$OLLAMA_OCR_MODEL" \
      -v rm="$OLLAMA_REWRITE_MODEL" -v same="$same" -v wipe="$wipe" >/dev/null 2>&1 <<'SQL'
UPDATE site_settings
   SET value = value || jsonb_build_object('provider', :'provider', 'baseUrl', :'url',
                                           'translationModel', :'tm', 'ocrModel', :'om', 'rewriteModel', :'rm')
                     || CASE WHEN :'same' = '' THEN '{}'::jsonb ELSE jsonb_build_object('sameModelForAll', (:'same')::boolean) END
                     || CASE WHEN :'wipe' = 'yes' THEN jsonb_build_object('apiKeyEnc', '') ELSE '{}'::jsonb END,
       updated_at = NOW()
 WHERE key = 'ai_config';
INSERT INTO site_settings (key, value, updated_at)
SELECT 'ai_config',
       value || jsonb_build_object('provider', :'provider', 'baseUrl', :'url',
                                   'translationModel', :'tm', 'ocrModel', :'om', 'rewriteModel', :'rm')
             || CASE WHEN :'same' = '' THEN '{}'::jsonb ELSE jsonb_build_object('sameModelForAll', (:'same')::boolean) END
             || CASE WHEN :'wipe' = 'yes' THEN jsonb_build_object('apiKeyEnc', '') ELSE '{}'::jsonb END,
       NOW()
  FROM site_settings
 WHERE key = 'ollama_config'
   AND NOT EXISTS (SELECT 1 FROM site_settings WHERE key = 'ai_config');
SQL
  then
    p_ok "Admin panel AI settings synchronised."
  else
    p_warn "Could not update the AI settings stored by the admin panel — check Admin → Services → AI."
  fi
}

create_admin_user() {
  local email="$1" name="$2"
  if docker compose exec -T postgres psql -U leksis_user -d leksis -q -v ON_ERROR_STOP=1 \
      -v email="$email" -v name="$name" >/dev/null 2>&1 <<'SQL'
INSERT INTO users (email, name, role) VALUES (:'email', :'name', 'admin')
ON CONFLICT (email) DO UPDATE SET role = 'admin', name = EXCLUDED.name;
SQL
  then
    p_ok "Admin user created: ${email}"
  else
    p_warn "Could not create the admin user. Create it later from the database or sign in and promote it."
  fi
}

# ── Backup / restore ──────────────────────────────────────────
# Archive layout: postgres.sql, uploads.tar (logo/background), .env, VERSION
record_backup_timestamp() {
  # Records the last successful backup time in site_settings so the admin dashboard can show
  # it (the backups/ directory lives on the host, not in the app container). Best-effort: a
  # failure here must never fail the backup itself.
  docker compose exec -T postgres psql -U leksis_user -d leksis -q -v ON_ERROR_STOP=1 \
      -v ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)" >/dev/null 2>&1 <<'SQL' || true
INSERT INTO site_settings (key, value, updated_at)
VALUES ('system_status', jsonb_build_object('lastBackupAt', :'ts'), NOW())
ON CONFLICT (key) DO UPDATE
  SET value      = site_settings.value || jsonb_build_object('lastBackupAt', :'ts'),
      updated_at = NOW();
SQL
}

create_backup() {
  local ts out work dir="${INSTALL_DIR}/backups"
  ts=$(date +%Y%m%d-%H%M%S)
  mkdir -p "$dir"; chmod 700 "$dir"
  out="${dir}/leksis-backup-${ts}.tar.gz"
  work=$(mktemp -d)

  p_info "Creating backup..."
  if ! docker compose exec -T postgres pg_dump -U leksis_user leksis >"${work}/postgres.sql" 2>/dev/null \
      || [[ ! -s "${work}/postgres.sql" ]]; then
    p_warn "PostgreSQL dump failed (is the postgres container running?)."
    rm -rf "$work"
    return 1
  fi
  if ! docker compose exec -T app tar -C /data/uploads -cf - . >"${work}/uploads.tar" 2>/dev/null; then
    p_warn "Uploads (logo / background) could not be saved — the app container may be offline."
    rm -f "${work}/uploads.tar"
  fi
  cp "${INSTALL_DIR}/.env" "${work}/.env"
  current_ref >"${work}/VERSION"

  tar -czf "$out" -C "$work" .
  chmod 600 "$out"
  rm -rf "$work"

  # Rotation: keep the newest BACKUP_KEEP archives
  # shellcheck disable=SC2012
  ls -1t "${dir}"/leksis-backup-*.tar.gz 2>/dev/null | tail -n +"$((BACKUP_KEEP + 1))" | xargs -r rm -f
  p_ok "Backup saved: ${out} ($(du -h "$out" | cut -f1))"
  p_info "The archive contains your .env (secrets) — keep it private."
  record_backup_timestamp
  LAST_BACKUP="$out"
  return 0
}
LAST_BACKUP=""

cmd_backup() {
  require_install
  p_header "Leksis - Backup"
  create_backup || die "Backup failed."
  p_info "Keeping the ${BACKUP_KEEP} most recent backups (LEKSIS_BACKUP_KEEP to change)."
  p_info "Restore with:  leksis restore ${LAST_BACKUP}"
}

cmd_restore() {
  require_install
  local file="${1:-}" work rc
  p_header "Leksis - Restore"

  if [[ -z "$file" ]]; then
    local -a opts=() found=()
    local f
    # shellcheck disable=SC2012
    while IFS= read -r f; do [[ -n "$f" ]] && found+=("$f"); done \
      < <(ls -1t "${INSTALL_DIR}"/backups/leksis-backup-*.tar.gz "${INSTALL_DIR}"/backups/leksis-pg-*.sql 2>/dev/null || true)
    [[ ${#found[@]} -gt 0 ]] || die "No backup found in ${INSTALL_DIR}/backups. Pass a file:  leksis restore <file>"
    for f in "${found[@]}"; do opts+=("${f}|$(basename "$f")  ($(du -h "$f" | cut -f1))"); done
    file=$(p_choose RESTORE_FILE "Backup to restore" "${found[0]}" "${opts[@]}")
  fi
  [[ -f "$file" ]] || die "Backup file not found: ${file}"

  work=$(mktemp -d)
  case "$file" in
    *.tar.gz) tar -xzf "$file" -C "$work" || die "Could not read the archive." ;;
    *.sql)    cp "$file" "${work}/postgres.sql" ;;
    *)        rm -rf "$work"; die "Unsupported backup format (expected .tar.gz or .sql)." ;;
  esac
  [[ -s "${work}/postgres.sql" ]] || { rm -rf "$work"; die "The backup contains no database dump."; }

  p_kv "Backup" "$(basename "$file")"
  p_kv "Version" "$(cat "${work}/VERSION" 2>/dev/null || echo 'unknown')"
  p_kv "Uploads" "$([[ -f "${work}/uploads.tar" ]] && echo included || echo 'not included')"
  p_warn "This REPLACES the current database (and uploaded logo/background if included)."
  local confirm
  confirm=$(p_input CONFIRM_RESTORE "Type RESTORE to confirm (anything else cancels)" "")
  if [[ "$confirm" != "RESTORE" ]]; then rm -rf "$work"; p_info "Restore cancelled - no changes made."; return 0; fi

  create_backup || p_warn "Safety backup of the current state failed — continuing."
  [[ -n "$LAST_BACKUP" ]] && p_info "Current state saved to ${LAST_BACKUP} in case you need to undo."

  # The backup's ENCRYPTION_KEY is needed to decrypt credentials stored in the database
  local bk_key cur_key
  bk_key=$(env_get "${work}/.env" ENCRYPTION_KEY)
  cur_key=$(env_get "${INSTALL_DIR}/.env" ENCRYPTION_KEY)
  if [[ -n "$bk_key" && "$bk_key" != "$cur_key" ]]; then
    if p_yesno RESTORE_ENCRYPTION_KEY "The backup used a different ENCRYPTION_KEY. Adopt it (needed to decrypt stored credentials)?" "y"; then
      _env_set ENCRYPTION_KEY "$bk_key" "${INSTALL_DIR}/.env"
      p_ok "ENCRYPTION_KEY restored from the backup."
    fi
  fi

  p_spin "Stopping the application" docker compose stop app || true

  p_info "Restoring the database..."
  docker compose exec -T postgres psql -U leksis_user -d leksis -q \
    -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;' >/dev/null 2>&1 \
    || { rm -rf "$work"; die "Could not reset the database schema."; }
  rc=0
  docker compose exec -T postgres psql -U leksis_user -d leksis -q \
    <"${work}/postgres.sql" >/dev/null 2>"${work}/restore.err" || rc=$?
  if grep 'ERROR:' "${work}/restore.err" | grep -qv 'schema "public" already exists'; then
    p_warn "The restore reported errors:"
    grep 'ERROR:' "${work}/restore.err" | head -5 | sed 's/^/      /' >&3 || true
    [[ -n "$LAST_BACKUP" ]] && p_warn "Previous state: ${LAST_BACKUP}"
  else
    p_ok "Database restored."
  fi

  p_spin "Starting the application" docker compose up -d app || die "Could not start the application."
  wait_healthy app 180 || true

  if [[ -f "${work}/uploads.tar" ]]; then
    if docker compose exec -T app sh -c 'find /data/uploads -mindepth 1 -delete; tar -C /data/uploads -xf -' \
        <"${work}/uploads.tar" >/dev/null 2>&1; then
      p_ok "Uploads restored."
    else
      p_warn "Uploads could not be restored."
    fi
  fi
  rm -rf "$work"
  p_header "Restore Complete"
}

# ── Mode: install ─────────────────────────────────────────────
save_answers() {
  mkdir -p "$LEKSIS_CONF_DIR"; chmod 700 "$LEKSIS_CONF_DIR"
  (
    umask 077
    {
      printf '# Saved by install.sh v%s — deleted when the installation completes\n' "$VERSION"
      printf 'LEKSIS_INSTALL_DIR=%s\n'              "$INSTALL_DIR"
      printf 'LEKSIS_REPO_URL=%s\n'                 "$REPO_URL"
      printf 'LEKSIS_APP_HOST=%s\n'                 "$APP_HOST"
      printf 'LEKSIS_ACCESS_MODE=%s\n'              "$ACCESS_MODE"
      printf 'LEKSIS_ACCESS_FALLBACK=%s\n'          "$ACCESS_FALLBACK"
      printf 'LEKSIS_ACCESS_TRUSTED=%s\n'           "$ACCESS_TRUSTED"
      printf 'LEKSIS_ADMIN_EMAIL=%s\n'              "$ADMIN_EMAIL"
      printf 'LEKSIS_ADMIN_NAME=%s\n'               "$ADMIN_NAME"
      printf 'LEKSIS_AI_MODE=%s\n'                  "$OLLAMA_MODE"
      printf 'LEKSIS_AI_URL=%s\n'                   "${OLLAMA_URL_RAW:-}"
      printf 'LEKSIS_AI_API_KEY=%s\n'               "$AI_API_KEY"
      printf 'LEKSIS_GPU_VENDOR=%s\n'               "${GPU_VENDOR:-none}"
      printf 'LEKSIS_OLLAMA_MODEL=%s\n'             "$OLLAMA_MODEL"
      printf 'LEKSIS_OLLAMA_OCR_MODEL=%s\n'         "$OLLAMA_OCR_MODEL"
      printf 'LEKSIS_OLLAMA_REWRITE_MODEL=%s\n'     "$OLLAMA_REWRITE_MODEL"
      printf 'LEKSIS_OLLAMA_KEEP_ALIVE=%s\n'        "$OLLAMA_KEEP_ALIVE"
      printf 'LEKSIS_OLLAMA_SCHED_SPREAD=%s\n'      "$OLLAMA_SCHED_SPREAD"
      printf 'LEKSIS_OLLAMA_MAX_LOADED_MODELS=%s\n' "$OLLAMA_MAX_LOADED_MODELS"
      printf 'LEKSIS_POSTGRES_PASSWORD=%s\n'        "$POSTGRES_PASSWORD"
      printf 'LEKSIS_PROCEED=y\n'
    } >"$ANSWERS_SAVE"
  )
}

# configure_remote_ollama — asks for and validates the URL of a remote Ollama server
configure_remote_ollama() {
  local raw url ver choice
  while true; do
    raw=$(p_input AI_URL "Ollama server URL (e.g. http://192.168.1.50:11434)" "${OLLAMA_URL_RAW:-}")
    p_unset_preset AI_URL
    url=$(normalize_ollama_url "$raw")
    if ! validate_url "$url"; then
      $NONINTERACTIVE && die "Invalid Ollama URL: ${raw}"
      p_warn "Invalid URL: ${raw}"; continue
    fi
    OLLAMA_URL_RAW="$raw"
    OLLAMA_URL_HOSTSIDE="$url"
    OLLAMA_URL="$url"
    # From inside a container, localhost is the container itself: use the host gateway
    if [[ "$url" =~ ^(https?://)(localhost|127\.[0-9.]+|0\.0\.0\.0)(:[0-9]+)?$ ]]; then
      OLLAMA_URL="${BASH_REMATCH[1]}host.docker.internal${BASH_REMATCH[3]}"
      p_info "Ollama on this same host: the app will use ${OLLAMA_URL}."
      p_warn "That Ollama must listen on the Docker bridge (OLLAMA_HOST=0.0.0.0), not only 127.0.0.1."
    fi
    if ver=$(ollama_version "$url"); then
      p_ok "Ollama ${ver:-server} reachable at ${url}"
      break
    fi
    p_warn "Cannot reach an Ollama server at ${url}."
    if $NONINTERACTIVE; then p_warn "Continuing anyway (non-interactive mode)."; break; fi
    choice=$(p_choose OLLAMA_UNREACHABLE "What now?" retry \
      "retry|Enter another URL" "continue|Continue anyway (configure it later)" "abort|Abort the installation")
    case "$choice" in
      continue) break ;;
      abort)    _abort ;;
    esac
  done
  p_warn "The Ollama API has no authentication — keep that server on a trusted network."
  p_info "On the remote machine Ollama must listen on the network (OLLAMA_HOST=0.0.0.0)."
}

# configure_openai_api — asks for and validates an OpenAI-compatible API (vLLM, LM Studio, llama.cpp, OpenAI…)
configure_openai_api() {
  local raw url choice models
  while true; do
    raw=$(p_input AI_URL "API base URL (e.g. http://192.168.1.50:8000/v1)" "${OLLAMA_URL_RAW:-}")
    p_unset_preset AI_URL
    url=$(normalize_openai_url "$raw")
    if ! validate_url "$url"; then
      $NONINTERACTIVE && die "Invalid API URL: ${raw}"
      p_warn "Invalid URL: ${raw}"; continue
    fi
    OLLAMA_URL_RAW="$raw"
    OLLAMA_URL_HOSTSIDE="$url"
    OLLAMA_URL="$url"
    # From inside a container, localhost is the container itself: use the host gateway
    if [[ "$url" =~ ^(https?://)(localhost|127\.[0-9.]+|0\.0\.0\.0)(:[0-9]+)(/.*)?$ ]]; then
      OLLAMA_URL="${BASH_REMATCH[1]}host.docker.internal${BASH_REMATCH[3]}${BASH_REMATCH[4]}"
      p_info "API on this same host: the app will use ${OLLAMA_URL}."
    fi
    if [[ -n "${AI_API_KEY:-}" ]]; then
      p_info "Keeping the current API key (enter a new one below to replace it)."
    fi
    local key
    key=$(p_secret AI_API_KEY "API key (optional — leave empty if the server has none${AI_API_KEY:+, or to keep the current one})")
    [[ -n "$key" ]] && AI_API_KEY="$key"
    if models=$(openai_models "$url" "$AI_API_KEY") && [[ -n "$models" ]]; then
      p_ok "API reachable at ${url} — $(wc -l <<<"$models" | tr -d ' ') model(s) served."
      break
    fi
    p_warn "Cannot list the models at ${url}/models (server down, wrong URL or wrong API key)."
    if $NONINTERACTIVE; then p_warn "Continuing anyway (non-interactive mode)."; break; fi
    choice=$(p_choose OLLAMA_UNREACHABLE "What now?" retry \
      "retry|Enter another URL / key" "continue|Continue anyway (configure it later)" "abort|Abort")
    case "$choice" in
      continue) break ;;
      abort)    _abort ;;
    esac
  done
  if ! host_looks_private "$url"; then
    p_warn "This server looks EXTERNAL to your network: your users' texts would be sent to it."
    p_warn "Leksis blocks external AI servers by default — after installing, tick"
    p_warn "'Allow servers outside the private network' in Admin → Services → AI."
  fi
  return 0
}

# configure_local_ollama — GPU + runtime settings for the bundled container
configure_local_ollama() {
  select_gpu
  # Not asked at install time (editable later with `leksis config`); override with LEKSIS_* variables
  OLLAMA_KEEP_ALIVE="${LEKSIS_OLLAMA_KEEP_ALIVE:--1}"
  OLLAMA_SCHED_SPREAD="${LEKSIS_OLLAMA_SCHED_SPREAD:-true}"
  OLLAMA_MAX_LOADED_MODELS="${LEKSIS_OLLAMA_MAX_LOADED_MODELS:-3}"
}

# ask_validated KEY "label" default REGEX "hint" — free input that must match REGEX
ask_validated() {
  local key="$1" label="$2" default="$3" regex="$4" hint="$5" v
  while true; do
    v=$(p_input "$key" "$label" "$default")
    if [[ "$v" =~ $regex ]]; then printf '%s' "$v"; return 0; fi
    $NONINTERACTIVE && die "Invalid value for ${key}: ${v} (${hint})"
    p_warn "Invalid value: ${v} (${hint})"; p_unset_preset "$key"
  done
}

ask_model() {
  local key="$1" label="$2" default="$3" m
  while true; do
    m=$(p_input "$key" "$label" "$default")
    if validate_model "$m"; then printf '%s' "$m"; return 0; fi
    $NONINTERACTIVE && die "Invalid model name: ${m}"
    p_warn "Invalid model name: ${m}"; p_unset_preset "$key"
  done
}

# ── Access: HTTP / HTTPS (domain) / behind a reverse proxy ────
# The public address is detected by the app from the request headers — nothing to configure but
# how Caddy is reached. The admin panel (Services → Caddy) manages the same settings.

is_domain_name() {
  [[ "$1" =~ ^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z][a-zA-Z0-9-]{1,62}$ ]]
}

# caddyfile_content MODE DOMAIN FALLBACK TRUSTED → the Caddyfile
# ⚠️ Same output as generateCaddyfile() in src/lib/caddy-config.ts — keep both in sync.
caddyfile_content() {
  local mode="$1" host="$2" fallback="$3" trusted="${4:-}" tp="private_ranges"
  [[ -n "$trusted" ]] && tp="private_ranges ${trusted}"
  printf '{\n  admin 0.0.0.0:2019\n  servers {\n    trusted_proxies static %s\n  }\n}\n\n' "$tp"
  case "$mode" in
    https)
      printf '%s {\n    encode gzip\n    request_body {\n        max_size 50MB\n    }\n    reverse_proxy app:3000 {\n        header_up X-Real-IP {remote_host}\n    }\n}\n' "$host"
      if [[ "$fallback" == "true" ]]; then
        printf '\n:80 {\n    request_body {\n        max_size 50MB\n    }\n    reverse_proxy app:3000 {\n        header_up X-Real-IP {remote_host}\n    }\n}\n'
      fi ;;
    proxy)
      printf ':80 {\n    request_body {\n        max_size 50MB\n    }\n    reverse_proxy app:3000 {\n        header_up X-Real-IP {remote_host}\n    }\n}\n' ;;
    *)
      printf ':80 {\n    encode gzip\n    request_body {\n        max_size 50MB\n    }\n    reverse_proxy app:3000 {\n        header_up X-Real-IP {remote_host}\n    }\n}\n' ;;
  esac
}

# ask_access DEFAULT_MODE DEFAULT_DOMAIN — sets ACCESS_MODE / ACCESS_HOST / ACCESS_FALLBACK /
# ACCESS_TRUSTED and the derived CADDY_HOST, APP_HOST and APP_URL (caller-declared variables)
ask_access() {
  local dmode="$1" ddomain="${2:-}" server_ip t tok ok
  server_ip=$(hostname -I 2>/dev/null | awk '{print $1}' || true)
  server_ip="${server_ip:-127.0.0.1}"

  ACCESS_MODE=$(p_choose ACCESS_MODE "How will users reach Leksis?" "$dmode" \
    "http|HTTP on this server's address (simplest — HTTPS can be added later)" \
    "https|HTTPS with a domain name (automatic Let's Encrypt certificate)" \
    "proxy|Behind a reverse proxy that handles HTTPS (Nginx Proxy Manager, Traefik…)")
  ACCESS_HOST=""; ACCESS_FALLBACK="true"; ACCESS_TRUSTED=""

  case "$ACCESS_MODE" in
    https)
      while true; do
        ACCESS_HOST=$(p_input APP_HOST "Domain name (e.g. leksis.example.com)" "$ddomain")
        ACCESS_HOST="${ACCESS_HOST,,}"
        is_domain_name "$ACCESS_HOST" && break
        $NONINTERACTIVE && die "Invalid domain name: ${ACCESS_HOST} (an IP address cannot get a certificate)"
        p_warn "Enter a domain name — an IP address cannot get a certificate: ${ACCESS_HOST}"
        p_unset_preset APP_HOST
      done
      if p_yesno ACCESS_FALLBACK "Keep HTTP access by IP address while HTTPS is being set up?" "y"; then
        ACCESS_FALLBACK="true"
      else
        ACCESS_FALLBACK="false"
      fi
      CADDY_HOST="$ACCESS_HOST"; APP_HOST="$ACCESS_HOST"; APP_URL="https://${ACCESS_HOST}"
      p_info "Point a DNS record (A / AAAA) for ${ACCESS_HOST} to this server and open ports 80 and 443."
      ;;
    proxy)
      p_info "In your proxy: forward to this server on port 80, keep the original Host header and"
      p_info "send X-Forwarded-Proto. The public address is detected automatically."
      while true; do
        t=$(p_input ACCESS_TRUSTED "Proxy IP / range if it is NOT on a private network (optional)" "")
        t=$(tr ',' ' ' <<<"$t" | xargs 2>/dev/null || true)
        ok=true
        for tok in $t; do [[ "$tok" =~ ^[0-9a-fA-F:.]+(/[0-9]{1,3})?$ ]] || ok=false; done
        $ok && break
        $NONINTERACTIVE && die "Invalid proxy address list: ${t}"
        p_warn "Use IP addresses or CIDR ranges separated by spaces (e.g. 203.0.113.10)."
        p_unset_preset ACCESS_TRUSTED
      done
      ACCESS_TRUSTED="$t"
      CADDY_HOST=":80"; APP_HOST="$server_ip"; APP_URL="the address configured in your proxy"
      ;;
    *)
      ACCESS_MODE="http"
      CADDY_HOST=":80"; APP_HOST=$(p_preset APP_HOST || printf '%s' "$server_ip"); APP_URL="http://${APP_HOST}"
      ;;
  esac
  p_ok "Access : $(access_label)"
}

access_label() {
  case "$ACCESS_MODE" in
    https) echo "HTTPS — https://${ACCESS_HOST}" ;;
    proxy) echo "behind a reverse proxy (HTTP on port 80)" ;;
    *)     echo "HTTP on this server (no encryption)" ;;
  esac
}

# current_access — reads the access settings (admin panel value, else inferred from CADDY_HOST)
current_access() {
  local row m="" h="" f="" t="" b="" envhost
  row=$(docker compose exec -T postgres psql -U leksis_user -d leksis -tA -F '|' -c \
    "SELECT COALESCE(value->>'mode',''), COALESCE(value->>'host',''), COALESCE(value->>'keepHttpFallback','true'), COALESCE(value->>'trustedProxies',''), COALESCE(value->>'behindProxy','false') FROM site_settings WHERE key = 'caddy_config'" \
    2>/dev/null | tr -d '\r' || true)
  IFS='|' read -r m h f t b <<<"$row" || true
  envhost=$(env_get "${INSTALL_DIR}/.env" CADDY_HOST)
  if [[ "$m" == "http" || "$m" == "https" || "$m" == "proxy" ]]; then
    ACCESS_MODE="$m"; ACCESS_HOST="$h"; ACCESS_FALLBACK="${f:-true}"; ACCESS_TRUSTED="$t"
  else
    ACCESS_HOST="${h:-$envhost}"; ACCESS_FALLBACK="true"; ACCESS_TRUSTED=""
    if is_domain_name "$ACCESS_HOST"; then ACCESS_MODE="https"
    elif [[ "$b" == "true" ]]; then ACCESS_MODE="proxy"; ACCESS_HOST=""
    else ACCESS_MODE="http"; ACCESS_HOST=""; fi
  fi
}

# apply_access_config — stores the access settings for the admin panel and reloads Caddy live
# (Caddy keeps the loaded config across restarts). Uses ACCESS_MODE / ACCESS_HOST / ACCESS_FALLBACK / ACCESS_TRUSTED.
apply_access_config() {
  local content host="" behind="false"
  [[ "$ACCESS_MODE" == "https" ]] && host="$ACCESS_HOST"
  [[ "$ACCESS_MODE" == "proxy" ]] && behind="true"
  content=$(caddyfile_content "$ACCESS_MODE" "$host" "$ACCESS_FALLBACK" "$ACCESS_TRUSTED")

  docker compose exec -T postgres psql -U leksis_user -d leksis -q -v ON_ERROR_STOP=1 \
      -v mode="$ACCESS_MODE" -v host="$host" -v fb="$ACCESS_FALLBACK" -v tp="$ACCESS_TRUSTED" -v behind="$behind" \
      >/dev/null 2>&1 <<'SQL' || p_warn "Could not store the access settings for the admin panel."
INSERT INTO site_settings (key, value, updated_at)
VALUES ('caddy_config',
        jsonb_build_object('mode', :'mode', 'host', :'host', 'keepHttpFallback', (:'fb')::boolean,
                           'trustedProxies', :'tp', 'behindProxy', (:'behind')::boolean),
        NOW())
ON CONFLICT (key) DO UPDATE
   SET value = (site_settings.value - 'nextauthUrl') || EXCLUDED.value, updated_at = NOW();
SQL

  if printf '%s\n' "$content" | docker compose exec -T caddy sh -c \
      'cat >/tmp/Caddyfile && caddy reload --config /tmp/Caddyfile --adapter caddyfile --address localhost:2019 --force' \
      >/dev/null 2>&1; then
    p_ok "Caddy configured: $(access_label)"
  else
    p_warn "Caddy could not be reloaded live — check:  leksis logs caddy"
  fi
  return 0
}

# ai_engine_label → one-line description of the configured AI engine
ai_engine_label() {
  case "$OLLAMA_MODE" in
    local)  echo "Ollama container on this server ($(gpu_label))" ;;
    remote) echo "Ollama server ${OLLAMA_URL}" ;;
    openai) echo "OpenAI-compatible API ${OLLAMA_URL}" ;;
  esac
}

# ask_openai_model KEY "label" DEFAULT — pick among the models served by the API (free text if none listed)
ask_openai_model() {
  local key="$1" label="$2" default="$3" list m
  local -a opts=()
  list=$(list_models)
  if [[ -n "$list" ]]; then
    if [[ -z "$default" ]] || ! grep -Fxq -- "$default" <<<"$list"; then default=$(head -1 <<<"$list"); fi
    if ! $NONINTERACTIVE && ! p_preset "$key" >/dev/null; then
      while IFS= read -r m; do
        [[ -n "$m" ]] && opts+=("${m}|${m}")
      done <<<"$list"
      m=$(p_choose "$key" "$label" "$default" "${opts[@]}")
      printf '%s' "$m"
      return 0
    fi
  fi
  ask_model "$key" "$label" "$default"
}

# ask_translation_model DEFAULT — pick a TranslateGemma size from a list
# (a current custom model stays selectable; LEKSIS_OLLAMA_MODEL may set any name)
ask_translation_model() {
  local default="$1" m
  local -a opts=("translategemma:27b|translategemma:27b   best quality  (~17 GB)"
                 "translategemma:12b|translategemma:12b   balanced      (~8 GB)"
                 "translategemma:4b|translategemma:4b    lightest      (~3 GB)")
  case "$default" in
    translategemma:27b|translategemma:12b|translategemma:4b) ;;
    *) opts+=("${default}|${default}   (current)") ;;
  esac
  m=$(p_choose OLLAMA_MODEL "Translation model" "$default" "${opts[@]}")
  validate_model "$m" || die "Invalid model name: ${m}"
  printf '%s' "$m"
}

# ask_ai_models DEFAULT_TRANSLATION [DEFAULT_OCR] [DEFAULT_REWRITE] — one model for translation, OCR
# and rewrite, or 3 models picked independently (OCR / rewrite pre-filled with the translation model).
# Sets OLLAMA_MODEL / OLLAMA_OCR_MODEL / OLLAMA_REWRITE_MODEL and SAME_MODEL_FOR_ALL (true/false).
ask_ai_models() {
  local def_t="$1" def_o="${2:-}" def_r="${3:-}" same_default="y"
  if [[ -n "$def_o" && "$def_o" != "$def_t" ]] || [[ -n "$def_r" && "$def_r" != "$def_t" ]]; then
    same_default="n"
  fi
  [[ "$OLLAMA_MODE" == "openai" ]] && p_info "Models are the ids served by the API (GET /models)."

  if p_yesno SAME_MODEL_FOR_ALL "Use the same model for translation, OCR and rewrite?" "$same_default"; then
    SAME_MODEL_FOR_ALL="true"
    if [[ "$OLLAMA_MODE" == "openai" ]]; then
      OLLAMA_MODEL=$(ask_openai_model OLLAMA_MODEL "Model (translation + OCR + rewrite, must accept images)" "$def_t")
    else
      OLLAMA_MODEL=$(ask_translation_model "$def_t")
    fi
    OLLAMA_OCR_MODEL="$OLLAMA_MODEL"
    OLLAMA_REWRITE_MODEL="$OLLAMA_MODEL"
  else
    SAME_MODEL_FOR_ALL="false"
    if [[ "$OLLAMA_MODE" == "openai" ]]; then
      OLLAMA_MODEL=$(ask_openai_model OLLAMA_MODEL "Translation model" "$def_t")
      OLLAMA_OCR_MODEL=$(ask_openai_model OLLAMA_OCR_MODEL "OCR model (must accept images)" "${def_o:-$OLLAMA_MODEL}")
      OLLAMA_REWRITE_MODEL=$(ask_openai_model OLLAMA_REWRITE_MODEL "Rewrite model" "${def_r:-$OLLAMA_MODEL}")
    else
      OLLAMA_MODEL=$(ask_translation_model "$def_t")
      OLLAMA_OCR_MODEL=$(ask_model OLLAMA_OCR_MODEL "OCR model" "${def_o:-$OLLAMA_MODEL}")
      OLLAMA_REWRITE_MODEL=$(ask_model OLLAMA_REWRITE_MODEL "Rewrite model" "${def_r:-$OLLAMA_MODEL}")
    fi
  fi
}

# build_env_content — generated .env (globals must be set)
build_env_content() {
  local profiles="" base_url="http://ollama:11434" provider="ollama"
  case "$OLLAMA_MODE" in
    local)  profiles="ollama" ;;
    remote) base_url="$OLLAMA_URL" ;;
    openai) base_url="$OLLAMA_URL"; provider="openai" ;;
  esac
  cat <<EOF
# Generated by install.sh v${VERSION} on $(date -u +"%Y-%m-%dT%H:%M:%SZ")

COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT}
COMPOSE_FILE=${COMPOSE_FILE_VALUE}
COMPOSE_PROFILES=${profiles}

POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_VERSION=18
DATABASE_URL=postgresql://leksis_user:${POSTGRES_PASSWORD}@postgres:5432/leksis
AUTH_SECRET=${AUTH_SECRET}
CADDY_HOST=${CADDY_HOST}
ENCRYPTION_KEY=${ENCRYPTION_KEY}

AI_PROVIDER=${provider}
AI_BASE_URL=${base_url}
AI_API_KEY=${AI_API_KEY}
OLLAMA_BASE_URL=${base_url}
OLLAMA_MODEL=${OLLAMA_MODEL}
OLLAMA_OCR_MODEL=${OLLAMA_OCR_MODEL}
OLLAMA_REWRITE_MODEL=${OLLAMA_REWRITE_MODEL}
EOF
  if [[ "$OLLAMA_MODE" == "local" ]]; then
    cat <<EOF
OLLAMA_IMAGE=${OLLAMA_IMAGE}
OLLAMA_KEEP_ALIVE=${OLLAMA_KEEP_ALIVE}
OLLAMA_SCHED_SPREAD=${OLLAMA_SCHED_SPREAD}
OLLAMA_MAX_LOADED_MODELS=${OLLAMA_MAX_LOADED_MODELS}
EOF
  fi
}

cmd_install() {
  local REPO_URL APP_HOST APP_URL CADDY_HOST ADMIN_EMAIL="" ADMIN_NAME="Admin"
  local POSTGRES_PASSWORD AUTH_SECRET ENCRYPTION_KEY OLLAMA_URL_RAW=""

  p_banner

  if [[ -f "$ANSWERS_SAVE" && -z "$ANSWERS_FILE" ]]; then
    if p_yesno RESUME "A previous installation was interrupted. Resume with the saved answers?" "y"; then
      load_answers_file "$ANSWERS_SAVE"
    else
      rm -f "$ANSWERS_SAVE"
    fi
  fi

  preflight_system

  # ── Step 1/5: Installation paths ───────────────────────────
  p_header "Configuration 1/5 - Installation Paths"
  INSTALL_DIR=$(p_input INSTALL_DIR "Install directory" "$DEFAULT_INSTALL_DIR")
  REPO_URL=$(p_input REPO_URL "Repository URL" "$DEFAULT_REPO_URL")

  # ── Step 2/5: Access (HTTP / HTTPS / reverse proxy) ────────
  p_header "Configuration 2/5 - Access"
  local default_mode="http" preset_host
  # Answer files from older versions only gave APP_HOST: a domain name meant HTTPS
  if preset_host=$(p_preset APP_HOST) && is_domain_name "$preset_host"; then default_mode="https"; fi
  ask_access "$default_mode" "${preset_host:-}"

  # ── Step 3/5: Admin account ────────────────────────────────
  p_header "Configuration 3/5 - Admin Account"
  say "  (leave email empty to skip admin user creation)"
  while true; do
    ADMIN_EMAIL=$(p_input ADMIN_EMAIL "Admin email (optional)" "")
    ADMIN_NAME=$(p_input ADMIN_NAME "Admin display name" "Admin")
    if [[ -z "$ADMIN_EMAIL" ]] || validate_email "$ADMIN_EMAIL"; then break; fi
    $NONINTERACTIVE && die "Invalid admin email: ${ADMIN_EMAIL}"
    p_warn "Invalid email address: ${ADMIN_EMAIL}"
    p_unset_preset ADMIN_EMAIL; p_unset_preset ADMIN_NAME
  done

  # ── Step 4/5: Ollama ───────────────────────────────────────
  p_header "Configuration 4/5 - AI Engine"
  OLLAMA_MODE=$(p_choose AI_MODE "Which AI engine should Leksis use?" "local" \
    "local|Ollama in a container on this server" \
    "remote|An Ollama server that already runs elsewhere" \
    "openai|An OpenAI-compatible API (vLLM, LM Studio, llama.cpp, OpenAI…)")
  case "$OLLAMA_MODE" in
    local)  configure_local_ollama ;;
    remote) GPU_VENDOR=""; GPU_NAME=""; configure_remote_ollama ;;
    openai) GPU_VENDOR=""; GPU_NAME=""; configure_openai_api ;;
    *)      die "Unknown AI mode: ${OLLAMA_MODE} (expected local, remote or openai)" ;;
  esac

  # ── Step 5/5: Models + database password ───────────────────
  p_header "Configuration 5/5 - AI Models & Database"
  if [[ "$OLLAMA_MODE" == "openai" ]]; then ask_ai_models ""
  else ask_ai_models "$OLLAMA_MODEL"; fi
  POSTGRES_PASSWORD=$(p_password POSTGRES_PASSWORD "Database password")

  # ── Summary ────────────────────────────────────────────────
  p_header "Summary"
  p_kv "Install dir"   "$INSTALL_DIR"
  p_kv "Access"        "$(access_label)"
  p_kv "App URL"       "$APP_URL"
  p_kv "Admin"         "${ADMIN_EMAIL:-not set}"
  p_kv "AI engine"     "$(ai_engine_label)"
  p_kv "Models"       "${OLLAMA_MODEL}, ${OLLAMA_OCR_MODEL}, ${OLLAMA_REWRITE_MODEL}"
  p_kv "DB password"   "$([[ -n "$POSTGRES_PASSWORD" ]] && echo 'custom' || echo 'auto-generated')"
  preflight_disk "$OLLAMA_MODE"
  preflight_network "$CADDY_HOST"
  say ""
  p_yesno PROCEED "Proceed with the installation?" "y" || { p_info "Installation aborted."; return 0; }

  local pw_auto=false
  if [[ -z "$POSTGRES_PASSWORD" ]]; then pw_auto=true; POSTGRES_PASSWORD=$(openssl rand -hex 16); fi
  save_answers

  # ── Prerequisites ──────────────────────────────────────────
  p_header "Installing Prerequisites"
  install_docker
  if [[ "$OLLAMA_MODE" == "local" ]]; then install_gpu_toolkit; fi
  resolve_compose_files

  # ── Repository ─────────────────────────────────────────────
  p_header "Repository"
  if [[ -d "$INSTALL_DIR/.git" ]]; then
    p_spin "Fetching release tags" git -C "$INSTALL_DIR" fetch --tags --force \
      || die "Could not fetch the repository."
    local LATEST_TAG
    LATEST_TAG=$(latest_tag "$INSTALL_DIR" "$(detect_channel "v${VERSION}")")
    if [[ -n "$LATEST_TAG" ]]; then
      prepare_checkout "$INSTALL_DIR"
      p_spin "Checking out ${LATEST_TAG}" git -C "$INSTALL_DIR" -c advice.detachedHead=false checkout "$LATEST_TAG" \
        || die "Could not check out ${LATEST_TAG} (local changes in ${INSTALL_DIR}?)."
    else
      p_warn "No release tags found. Re-run install.sh after a release is published."
    fi
  elif [[ -d "$INSTALL_DIR" && -n "$(ls -A "$INSTALL_DIR" 2>/dev/null)" ]]; then
    p_warn "${INSTALL_DIR} exists but is not a git repository."
    if p_yesno WIPE_DIR "Empty it and clone fresh?" "n"; then
      cd /tmp
      rm -rf "$INSTALL_DIR"
      p_spin "Cloning from GitHub" git clone --branch "v${VERSION}" "$REPO_URL" "$INSTALL_DIR" \
        || die "Clone failed."
    else
      p_info "Installation aborted."; return 0
    fi
  else
    p_spin "Cloning from GitHub" git clone --branch "v${VERSION}" "$REPO_URL" "$INSTALL_DIR" \
      || die "Clone failed (tag v${VERSION} not found?)."
  fi
  p_ok "Repository ready at ${INSTALL_DIR}"
  cd "$INSTALL_DIR"
  git config core.fileMode false

  # ── .env (secrets of an existing .env are kept) ────────────
  AUTH_SECRET=$(env_get .env AUTH_SECRET);       [[ -n "$AUTH_SECRET" ]]    || AUTH_SECRET=$(openssl rand -base64 32)
  ENCRYPTION_KEY=$(env_get .env ENCRYPTION_KEY); [[ -n "$ENCRYPTION_KEY" ]] || ENCRYPTION_KEY=$(openssl rand -hex 32)
  if [[ -f .env ]]; then
    p_info "Existing .env found — keeping its secrets."
    COMPOSE_PROJECT=$(compose_project)
    if $pw_auto && [[ -n "$(env_get .env POSTGRES_PASSWORD)" ]]; then
      POSTGRES_PASSWORD=$(env_get .env POSTGRES_PASSWORD)
    fi
  fi
  local ENV_CONTENT line
  ENV_CONTENT=$(build_env_content)

  p_header ".env Preview (secrets masked)"
  while IFS= read -r line; do
    if [[ "$line" =~ ^(POSTGRES_PASSWORD|AUTH_SECRET|ENCRYPTION_KEY|DATABASE_URL|AI_API_KEY)= ]]; then
      say "  ${line%%=*}=****"
    else
      say "  ${line}"
    fi
  done <<<"$ENV_CONTENT"
  printf '%s\n' "$ENV_CONTENT" >.env
  chmod 600 .env
  p_ok ".env written."

  # ── Stale volume guard ─────────────────────────────────────
  if docker volume inspect "${COMPOSE_PROJECT}_postgres_data" &>/dev/null; then
    p_warn "A PostgreSQL data volume (${COMPOSE_PROJECT}_postgres_data) already exists from a previous installation."
    show_volumes_info
    p_warn "Reusing it with a freshly generated password/config can break authentication or trigger version-layout errors."
    if ! p_yesno REUSE_VOLUME "Continue and reuse this existing volume as-is?" "n"; then
      p_info "Installation aborted. Remove it manually first if you want a clean slate:"
      p_info "  docker volume rm ${COMPOSE_PROJECT}_postgres_data"
      return 0
    fi
  fi

  # ── Start containers ───────────────────────────────────────
  p_header "Building and Starting Containers"
  run_with_bar "Downloading images" layers docker compose pull --ignore-buildable \
    || die "Image download failed — see ${LOG_FILE:-the output above}."
  p_info "Building the application (several minutes on a first install)..."
  run_with_bar "Building the application" steps docker compose build app \
    || die "Application build failed — see ${LOG_FILE:-the output above}."
  p_spin "Starting the containers" docker compose up -d \
    || die "docker compose up failed — see ${LOG_FILE:-the output above}."

  local svc
  for svc in $(services_list); do
    case "$svc" in
      postgres|ollama) wait_healthy "$svc" 120 || true ;;
      app)             wait_healthy "$svc" 180 || true ;;
      caddy)           wait_healthy "$svc" 60  || true ;;
    esac
  done

  # Store the access mode for the admin panel and load the matching Caddyfile
  apply_access_config

  # ── Models ─────────────────────────────────────────────────
  p_header "AI Models"
  ensure_models

  # ── Admin user ─────────────────────────────────────────────
  [[ -n "$ADMIN_EMAIL" ]] && create_admin_user "$ADMIN_EMAIL" "$ADMIN_NAME"

  # ── Final check + conveniences ─────────────────────────────
  check_app_http || true
  mkdir -p "$LEKSIS_CONF_DIR"; chmod 700 "$LEKSIS_CONF_DIR"
  printf 'INSTALL_DIR=%s\n' "$INSTALL_DIR" >"$INSTALL_CONF"
  install_launcher
  rm -f "$ANSWERS_SAVE"

  p_header "Installation Complete!"
  p_kv "App URL"     "$APP_URL"
  p_kv "Admin"       "${ADMIN_EMAIL:-not set}"
  p_kv "Install dir" "$INSTALL_DIR"
  p_kv "AI engine"   "$(ai_engine_label)"
  p_kv "Log file"    "${LOG_FILE:-n/a}"
  if [[ ${#FAILED_MODELS[@]} -gt 0 ]]; then
    say ""
    p_warn "These models could not be pulled: ${FAILED_MODELS[*]}"
    p_warn "Pull them later from Admin → Services → AI, or re-run:  leksis config"
  fi
  if [[ "$ACCESS_MODE" == "https" ]]; then
    say ""
    p_info "HTTPS: the certificate is requested from Let's Encrypt in the background."
    p_info "Follow it in Admin → Services → Caddy. It needs ${ACCESS_HOST} to point to this server"
    p_info "and ports 80 and 443 to be open; until then use http://$(hostname -I 2>/dev/null | awk '{print $1}')."
  elif [[ "$ACCESS_MODE" == "http" ]]; then
    say ""
    p_info "To switch to HTTPS later: Admin → Services → Caddy → HTTPS (or:  leksis config)."
  fi
  say ""
  say "  Useful commands (run as root):"
  say "    leksis status   - service status"
  say "    leksis logs     - follow logs"
  say "    leksis update   - update to the latest release"
  say "    leksis backup   - backup database + uploads"
  say "    leksis config   - edit the AI engine / models"
  say ""
}

# ── Mode: update ──────────────────────────────────────────────
# prepare_checkout DIR — makes `git checkout <tag>` safe on an install directory:
# file-mode changes are ignored (chmod +x on install.sh used to block updates) and
# real local edits to tracked files are stashed instead of aborting the update.
prepare_checkout() {
  local dir="$1"
  git -C "$dir" config core.fileMode false
  if [[ -n "$(git -C "$dir" status --porcelain --untracked-files=no 2>/dev/null)" ]]; then
    p_warn "Local changes found in ${dir} — saving them with 'git stash' before switching versions."
    git -C "$dir" stash push -q -m "leksis-update-$(date +%Y%m%d-%H%M%S)" \
      || die "Could not stash the local changes in ${dir}. Review them with: git -C ${dir} status"
    p_info "Restore them later with: git -C ${dir} stash pop"
  fi
  return 0
}

# install_launcher — /usr/local/bin/leksis runs the install dir's install.sh
# (a wrapper rather than a symlink: it does not depend on the file's exec bit)
install_launcher() {
  printf '#!/usr/bin/env bash\nexec bash "%s/install.sh" "$@"\n' "$INSTALL_DIR" >/usr/local/bin/leksis 2>/dev/null \
    && chmod 755 /usr/local/bin/leksis 2>/dev/null || p_warn "Could not create /usr/local/bin/leksis — run ${INSTALL_DIR}/install.sh instead."
  return 0
}

# rollback_app SHA — puts the sources back and rebuilds the app container
rollback_app() {
  local sha="$1"
  p_warn "Rolling back the application to ${sha:0:12}..."
  git -c advice.detachedHead=false checkout "$sha" >/dev/null 2>&1 \
    || { p_err "Could not restore the previous sources — restore manually: git checkout ${sha}"; return 1; }
  run_with_bar "Rebuilding the application" steps docker compose build app || return 1
  p_spin "Restarting app" docker compose up -d app || return 1
  wait_healthy app 180
}

cmd_update() {
  p_banner
  require_install
  p_header "Leksis v${VERSION} - Update"

  # An IP-based NEXTAUTH_URL from older installs is dropped (the app is restarted below to apply it)
  local url_migrated=false
  migrate_pinned_url && url_migrated=true

  p_info "Current container status:"
  docker compose ps >&3 2>&1 || p_warn "(unavailable)"

  p_spin "Fetching release tags" git fetch --tags --force || die "Could not fetch release tags."

  local prev_sha prev_ref cur latest channel target=""
  prev_sha=$(git rev-parse HEAD)
  prev_ref=$(current_ref)
  cur=$(git describe --tags --exact-match HEAD 2>/dev/null || echo "")
  channel=$(detect_channel "$cur")
  latest=$(latest_tag . "$channel")
  [[ "$channel" == "beta" ]] && p_warn "Beta channel: pre-release versions are followed."

  if [[ -z "$latest" ]]; then
    p_warn "No release tags found in repository. Cannot update sources."
  elif [[ "$cur" == "$latest" ]]; then
    p_ok "Already on latest release: ${latest}"
  else
    if [[ -z "$cur" ]]; then
      p_warn "Current installation is not pinned to a release tag (branch or unknown state)."
    else
      p_info "Current release : ${cur}"
    fi
    p_info "Latest release  : ${latest}"
    if p_yesno SWITCH_TAG "Switch to ${latest}?" "y"; then target="$latest"; fi
  fi

  # Component selection
  local -a opts=("app|Application (rebuild from sources)" "caddy|Caddy reverse proxy (pull image)"
                 "postgres|PostgreSQL (pull minor updates)")
  ollama_local_enabled && opts+=("ollama|Ollama container (pull image)")
  if [[ "$OLLAMA_MODE" == "openai" ]]; then opts+=("models|AI models (check they are served by the API)")
  else opts+=("models|AI models (pull the missing ones)"); fi
  local defaults="" components c
  [[ -n "$target" ]] && defaults="app"
  components=$(p_multi UPDATE_COMPONENTS "Components to update" "$defaults" "${opts[@]}")
  if [[ -z "$target" && -z "${components// /}" ]]; then
    if $url_migrated; then
      p_spin "Restarting the app (public address detection)" docker compose up -d app || true
      wait_healthy app 180 || true
    fi
    p_info "Nothing selected. Update cancelled."
    return 0
  fi

  # Safety backup before touching anything
  if ! create_backup; then
    p_yesno CONTINUE_NO_BACKUP "Backup failed. Continue the update without a backup?" "n" \
      || { p_info "Update cancelled."; return 0; }
  fi

  if [[ -n "$target" ]]; then
    prepare_checkout "$INSTALL_DIR"
    p_spin "Switching to ${target}" git -c advice.detachedHead=false checkout "$target" \
      || die "Could not check out ${target} (local changes in ${INSTALL_DIR}?)."
    [[ " $components " == *" app "* ]] \
      || p_warn "Sources updated but the app image was not rebuilt — select 'app' to apply the new version."
  fi

  # GPU overlay may have changed (driver installed since the last run)
  if ollama_local_enabled; then
    ensure_lspci; detect_gpu
    if [[ -n "$GPU_VENDOR" ]]; then
      resolve_compose_files
      _env_set COMPOSE_FILE "$COMPOSE_FILE_VALUE" .env
      _env_set OLLAMA_IMAGE "$OLLAMA_IMAGE" .env
    fi
  fi

  local failed=false
  for c in postgres ollama caddy app models; do
    [[ " $components " == *" $c "* ]] || continue
    case "$c" in
      app)
        run_with_bar "Rebuilding the application" steps docker compose build --pull app || failed=true
        if ! $failed; then
          p_spin "Restarting app" docker compose up -d app || failed=true
          $failed || wait_healthy app 180 || failed=true
        fi ;;
      postgres|ollama|caddy)
        run_with_bar "Downloading ${c} image" layers docker compose pull "$c" || true
        p_spin "Restarting ${c}" docker compose up -d "$c" || true
        wait_healthy "$c" 180 || true ;;
      models) ensure_models ;;
    esac
  done

  if $failed; then
    p_err "The application did not come back healthy after the update."
    if [[ -n "$target" ]] && p_yesno AUTO_ROLLBACK "Roll back to ${prev_ref}?" "y"; then
      if rollback_app "$prev_sha"; then p_ok "Rolled back to ${prev_ref}."; else p_err "Rollback failed."; fi
      [[ -n "$LAST_BACKUP" ]] && p_info "Database backup taken before the update: ${LAST_BACKUP}"
    fi
    return 1
  fi

  # The app was not rebuilt but the removed NEXTAUTH_URL must reach it
  if $url_migrated && [[ " $components " != *" app "* ]]; then
    p_spin "Restarting the app (public address detection)" docker compose up -d app || true
    wait_healthy app 180 || true
  fi

  check_app_http || true
  install_launcher
  p_header "Update Complete"
  p_ok "Now on $(current_ref). Volumes (database, models, uploads) preserved."
  if [[ ${#FAILED_MODELS[@]} -gt 0 ]]; then p_warn "Models not pulled: ${FAILED_MODELS[*]}"; fi
}

# ── Mode: uninstall ───────────────────────────────────────────
cmd_uninstall() {
  p_banner
  require_install
  p_header "Leksis v${VERSION} - Uninstall"

  p_info "Volume disk usage:"
  show_volumes_info

  local have_backup=false
  if p_yesno BACKUP_BEFORE "Create a backup before removal?" "y"; then
    create_backup && have_backup=true
  fi

  p_warn "Keep PostgreSQL data (and Ollama models)?"
  p_warn "  Yes = Docker volumes preserved"
  p_warn "  No  = ALL data permanently deleted"
  local KEEP_DATA=false
  if p_yesno KEEP_DATA "Keep data volumes?" "n"; then
    KEEP_DATA=true; p_ok "Volumes will be preserved."
  else
    p_warn "All data will be permanently deleted."
  fi

  say ""
  p_warn "This will remove:"
  p_warn "  - Containers: $(services_list | sed -E 's/[a-z]+/leksis-&/g')"
  p_warn "  - The application image"
  p_warn "  - Directory: ${INSTALL_DIR}"
  local confirm
  confirm=$(p_input CONFIRM_DELETE "Type DELETE to confirm (anything else cancels)" "")
  if [[ "$confirm" != "DELETE" ]]; then p_info "Uninstall cancelled - no changes made."; return 0; fi

  # Backups live inside the install dir — move them out before it is deleted
  if $have_backup || compgen -G "${INSTALL_DIR}/backups/*" >/dev/null; then
    if mkdir -p /var/backups/leksis && chmod 700 /var/backups/leksis \
        && cp -a "${INSTALL_DIR}"/backups/. /var/backups/leksis/; then
      p_ok "Backups copied to /var/backups/leksis"
    else
      die "Could not copy the backups to /var/backups/leksis — aborting before anything is removed."
    fi
  fi

  local was_local=false
  ollama_local_enabled && was_local=true

  p_info "Stopping and removing containers..."
  if $KEEP_DATA; then
    docker compose down --remove-orphans --rmi local 2>/dev/null || true
  else
    docker compose down --remove-orphans --rmi local -v 2>/dev/null || true
  fi

  if $was_local && p_yesno REMOVE_OLLAMA_IMAGE "Also remove the Ollama Docker image? (may free 5-10 GB)" "n"; then
    docker image rm ollama/ollama:latest ollama/ollama:rocm 2>/dev/null || true
  fi

  p_info "Removing installation directory..."
  cd /
  rm -rf "$INSTALL_DIR"
  if [[ "$(readlink /usr/local/bin/leksis 2>/dev/null)" == "${INSTALL_DIR}/install.sh" ]] \
     || grep -qs "${INSTALL_DIR}/install.sh" /usr/local/bin/leksis; then
    rm -f /usr/local/bin/leksis
  fi
  rm -f "$INSTALL_CONF" "$ANSWERS_SAVE"

  p_header "Uninstall Complete"
  p_ok "Leksis has been completely removed."
  if $KEEP_DATA; then
    p_ok "Volumes were preserved. To list / remove them:  docker volume ls"
  fi
}

# ── Mode: status ──────────────────────────────────────────────
cmd_status() {
  require_install
  p_header "Leksis v${VERSION} - Service Status"

  local ref channel code ver
  ref=$(current_ref)
  channel=$(detect_channel "$(git describe --tags --exact-match HEAD 2>/dev/null || echo '')")
  p_kv "Installed"   "${ref} (${channel} channel)"
  p_kv "Install dir" "$INSTALL_DIR"
  current_access
  p_kv "Access"      "$(access_label)"
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 6 http://127.0.0.1/ 2>/dev/null || true)
  p_kv "HTTP check"  "${code:-no answer}"

  say ""; say "  === Containers ==="
  docker compose ps >&3 2>&1 || say "    (unavailable)"

  say ""; say "  === AI engine ==="
  if [[ "$OLLAMA_MODE" == "local" ]]; then
    ensure_lspci; detect_gpu
  fi
  p_kv "Engine" "$(ai_engine_label)"
  case "$OLLAMA_MODE" in
    local)
      p_kv "GPU" "$(gpu_label)" ;;
    remote)
      if ver=$(ollama_version "${OLLAMA_URL_HOSTSIDE:-$OLLAMA_URL}"); then p_ok "Reachable (version ${ver:-?})"
      else p_warn "Not reachable from this host."; fi ;;
    openai)
      if [[ -n "$(list_models)" ]]; then p_ok "API reachable"
      else p_warn "API not reachable from this host (or no model listed)."; fi
      if ! host_looks_private "$OLLAMA_URL"; then
        p_warn "External server: allowed only if 'Allow servers outside the private network' is ticked in Admin → Services → AI."
      fi ;;
  esac
  local models m present
  models=$(printf '%s\n' "$OLLAMA_MODEL" "$OLLAMA_OCR_MODEL" "$OLLAMA_REWRITE_MODEL" | awk 'NF && !seen[$0]++')
  present=$(list_models)
  while IFS= read -r m; do
    if model_present "$m" "$present"; then p_ok "Model ${m}"; else p_warn "Model ${m} — not installed on the server"; fi
  done <<<"$models"

  say ""; say "  === Disk Usage ==="
  show_volumes_info
  [[ -d backups ]] && p_kv "Backups" "$(du -sh backups 2>/dev/null | cut -f1) ($(ls -1 backups 2>/dev/null | wc -l) files)"

  say ""; say "  === Recent App Logs (last 20 lines) ==="
  docker compose logs --tail=20 app >&3 2>&1 || say "    (unavailable)"
  say ""
}

# ── Mode: logs ────────────────────────────────────────────────
cmd_logs() {
  local service="${1:-}" s
  require_install
  local -a opts=()
  for s in $(services_list); do opts+=("${s}|${s}"); done
  if [[ -z "$service" ]]; then
    service=$(p_choose LOG_SERVICE "Service" "app" "${opts[@]}")
  fi
  [[ " $(services_list) " == *" $service "* ]] \
    || die "Unknown service: ${service} (available: $(services_list))"
  p_info "Streaming logs for ${service} (Ctrl+C to stop)..."
  docker compose logs -f --tail=100 "$service"
}

# ── Mode: config ──────────────────────────────────────────────
cmd_config() {
  p_banner
  require_install
  p_header "Leksis v${VERSION} - Configuration"
  say "  (press Enter to keep the current value)"

  local old_mode="$OLLAMA_MODE" old_url="$OLLAMA_URL" old_key="$AI_API_KEY" old_m="$OLLAMA_MODEL" old_o="$OLLAMA_OCR_MODEL"
  local old_r="$OLLAMA_REWRITE_MODEL" old_k="$OLLAMA_KEEP_ALIVE" old_s="$OLLAMA_SCHED_SPREAD" old_x="$OLLAMA_MAX_LOADED_MODELS"
  local old_pg new_pg key_changed="no" provider="ollama" OLLAMA_URL_RAW="$OLLAMA_URL_HOSTSIDE"
  local APP_HOST APP_URL CADDY_HOST access_changed=false old_access
  old_pg=$(env_get .env POSTGRES_VERSION)

  OLLAMA_MODE=$(p_choose AI_MODE "Which AI engine should Leksis use?" "$old_mode" \
    "local|Ollama in a container on this server" \
    "remote|An Ollama server running elsewhere" \
    "openai|An OpenAI-compatible API (vLLM, LM Studio, llama.cpp, OpenAI…)")

  # Connection first: the list of models to choose from comes from the server
  case "$OLLAMA_MODE" in
    local)
      OLLAMA_URL="http://ollama:11434"; AI_API_KEY="" ;;
    remote)
      AI_API_KEY=""
      [[ "$old_mode" == "remote" ]] || OLLAMA_URL_RAW=""
      configure_remote_ollama ;;
    openai)
      if [[ "$old_mode" != "openai" ]]; then OLLAMA_URL_RAW=""; AI_API_KEY=""; fi
      configure_openai_api ;;
    *) die "Unknown AI mode: ${OLLAMA_MODE} (expected local, remote or openai)" ;;
  esac

  # Coming from an API, its model ids mean nothing to Ollama: propose the usual models instead
  if [[ "$OLLAMA_MODE" != "openai" && "$old_mode" == "openai" ]]; then old_m="$DEFAULT_MODEL"; old_o=""; old_r=""; fi
  ask_ai_models "$old_m" "$old_o" "$old_r"

  if [[ "$OLLAMA_MODE" == "local" ]]; then
    # Runtime settings: defaults are -1 / true / 3 and are not asked at install time
    if [[ -n "${LEKSIS_OLLAMA_KEEP_ALIVE+x}${LEKSIS_OLLAMA_SCHED_SPREAD+x}${LEKSIS_OLLAMA_MAX_LOADED_MODELS+x}" ]] \
       || p_yesno CONFIG_RUNTIME "Edit the Ollama runtime settings (keep alive, GPU spread, max loaded models)?" "n"; then
      OLLAMA_KEEP_ALIVE=$(ask_validated OLLAMA_KEEP_ALIVE "Keep alive (-1=forever, 5m=5min, 0=unload)" "$old_k" '^(-1|[0-9]+[smh]?)$' "-1, 0, 30s, 5m, 2h")
      OLLAMA_SCHED_SPREAD=$(ask_validated OLLAMA_SCHED_SPREAD "GPU scheduling spread (true/false)" "$old_s" '^(true|false)$' "true or false")
      OLLAMA_MAX_LOADED_MODELS=$(ask_validated OLLAMA_MAX_LOADED_MODELS "Max models loaded in VRAM" "$old_x" '^[1-9][0-9]*$' "a number >= 1")
    fi
  fi
  new_pg=$(p_input POSTGRES_VERSION "PostgreSQL version" "${old_pg:-18}")

  # How users reach Leksis (HTTP / HTTPS with a domain / behind a reverse proxy)
  current_access
  old_access="${ACCESS_MODE}|${ACCESS_HOST}|${ACCESS_FALLBACK}|${ACCESS_TRUSTED}"
  say ""
  p_kv "Access" "$(access_label)"
  if [[ -n "${LEKSIS_ACCESS_MODE+x}" ]] \
     || p_yesno CONFIG_ACCESS "Change how users reach Leksis (HTTP / HTTPS domain / reverse proxy)?" "n"; then
    ask_access "$ACCESS_MODE" "$ACCESS_HOST"
    [[ "${ACCESS_MODE}|${ACCESS_HOST}|${ACCESS_FALLBACK}|${ACCESS_TRUSTED}" != "$old_access" ]] && access_changed=true
  fi

  # ── Apply ──────────────────────────────────────────────────
  if [[ "$old_mode" == "local" && "$OLLAMA_MODE" != "local" ]]; then
    if p_yesno REMOVE_OLLAMA_CONTAINER "Stop and remove the local Ollama container? (the models volume is kept)" "y"; then
      docker compose --profile ollama rm -sf ollama >/dev/null 2>&1 || true
    fi
    _env_set COMPOSE_PROFILES "" .env
    _env_set COMPOSE_FILE "docker-compose.yml" .env
  elif [[ "$old_mode" != "local" && "$OLLAMA_MODE" == "local" ]]; then
    select_gpu
    resolve_compose_files
    _env_set COMPOSE_PROFILES "ollama" .env
    _env_set COMPOSE_FILE "$COMPOSE_FILE_VALUE" .env
    _env_set OLLAMA_IMAGE "$OLLAMA_IMAGE" .env
    [[ "$GPU_VENDOR" == "nvidia" ]] && install_gpu_toolkit
  fi
  [[ "$OLLAMA_MODE" == "openai" ]] && provider="openai"
  _env_set AI_PROVIDER "$provider" .env
  _env_set AI_BASE_URL "$OLLAMA_URL" .env
  _env_set AI_API_KEY "$AI_API_KEY" .env
  _env_set OLLAMA_BASE_URL "$OLLAMA_URL" .env
  _env_set OLLAMA_MODEL "$OLLAMA_MODEL" .env
  _env_set OLLAMA_OCR_MODEL "$OLLAMA_OCR_MODEL" .env
  _env_set OLLAMA_REWRITE_MODEL "$OLLAMA_REWRITE_MODEL" .env
  if [[ "$OLLAMA_MODE" == "local" ]]; then
    _env_set OLLAMA_KEEP_ALIVE "$OLLAMA_KEEP_ALIVE" .env
    _env_set OLLAMA_SCHED_SPREAD "$OLLAMA_SCHED_SPREAD" .env
    _env_set OLLAMA_MAX_LOADED_MODELS "$OLLAMA_MAX_LOADED_MODELS" .env
  fi
  _env_set POSTGRES_VERSION "$new_pg" .env
  p_ok "Settings written to: ${INSTALL_DIR}/.env"

  local app_changed=false ollama_changed=false
  [[ "$OLLAMA_MODE" != "$old_mode" || "$OLLAMA_URL" != "$old_url" || "$AI_API_KEY" != "$old_key" \
     || "$OLLAMA_MODEL" != "$old_m" || "$OLLAMA_OCR_MODEL" != "$old_o" \
     || "$OLLAMA_REWRITE_MODEL" != "$old_r" ]] && app_changed=true
  [[ "$OLLAMA_KEEP_ALIVE" != "$old_k" || "$OLLAMA_SCHED_SPREAD" != "$old_s" \
     || "$OLLAMA_MAX_LOADED_MODELS" != "$old_x" ]] && ollama_changed=true
  # A new server / mode / key: the key stored (encrypted) by the admin panel must not follow
  [[ "$OLLAMA_MODE" != "$old_mode" || "$OLLAMA_URL" != "$old_url" || "$AI_API_KEY" != "$old_key" ]] && key_changed="yes"

  if [[ "$old_mode" != "local" && "$OLLAMA_MODE" == "local" ]]; then
    p_spin "Starting the Ollama container" docker compose up -d ollama || true
    wait_healthy ollama 120 || true
  elif [[ "$OLLAMA_MODE" == "local" && "$ollama_changed" == true ]]; then
    if p_yesno RESTART_OLLAMA "Ollama runtime settings changed. Restart the Ollama container now?" "y"; then
      p_spin "Restarting Ollama" docker compose up -d ollama || true
    fi
  fi
  if $app_changed; then
    sync_ai_config_db "$key_changed"
    p_spin "Applying the new configuration to the app" docker compose up -d app || true
    wait_healthy app 180 || true
    if p_yesno CHECK_MODELS "Check the models on the AI server now?" "y"; then ensure_models; fi
  fi

  if $access_changed; then
    _env_set CADDY_HOST "$CADDY_HOST" .env
    apply_access_config
    if [[ "$ACCESS_MODE" == "https" ]]; then
      p_info "The certificate is requested in the background — follow it in Admin → Services → Caddy."
      p_info "${ACCESS_HOST} must point to this server and ports 80 and 443 must be open."
    fi
  fi

  # A pinned NEXTAUTH_URL overrides the automatically detected public address (Auth.js forces every
  # redirect to it): after an access change it is removed, otherwise offered
  local pinned
  pinned=$(env_get .env NEXTAUTH_URL)
  if [[ -n "$pinned" ]]; then
    if $access_changed \
       || p_yesno CLEAR_PINNED_URL "NEXTAUTH_URL is pinned to ${pinned} and overrides the detected address (wrong redirects behind a proxy or after switching to HTTPS). Remove it (recommended)?" "y"; then
      clear_pinned_url
      p_info "NEXTAUTH_URL removed: the public address is now detected automatically."
      p_spin "Restarting the app" docker compose up -d app || true
      wait_healthy app 180 || true
    fi
  fi

  if [[ "$new_pg" != "$old_pg" ]]; then
    say ""
    p_warn "POSTGRES_VERSION updated to: ${new_pg}"
    p_warn "Changing the PostgreSQL major version on an existing installation requires a data"
    p_warn "migration (pg_upgrade or pg_dump / pg_restore). The container has NOT been restarted."
  fi
  if [[ ${#FAILED_MODELS[@]} -gt 0 ]]; then p_warn "Models not pulled: ${FAILED_MODELS[*]}"; fi
  return 0
}

# ── Interactive menu (no argument) ────────────────────────────
show_menu() {
  local choice default
  while true; do
    default="install"
    if [[ -f "$INSTALL_CONF" || -f "${DEFAULT_INSTALL_DIR}/.env" ]]; then default="status"; fi
    clear_screen
    p_banner
    choice=$(p_choose MENU "What do you want to do?" "$default" \
      "install|install    Full installation on a fresh server" \
      "update|update     Update components (automatic rollback)" \
      "status|status     Live status of all services" \
      "config|config     Edit models / Ollama location" \
      "logs|logs       Follow service logs" \
      "backup|backup     Backup database, uploads and .env" \
      "restore|restore    Restore a backup" \
      "uninstall|uninstall  Clean removal of all components" \
      "quit|quit")
    p_unset_preset MENU
    [[ "$choice" == "quit" ]] && { p_info "Goodbye."; return 0; }
    # Each command runs in its own subshell so a failure returns to the menu
    set +e
    ( MENU_DEPTH=1; set -e; "cmd_${choice}" )
    set -e
    p_pause
  done
}

# ── Usage ─────────────────────────────────────────────────────
usage() {
  cat <<EOF
Leksis deployment manager v${VERSION}

Usage: $0 [options] [command]

Commands:
  install            Full guided installation on a fresh server
  update             Update components (backup first, automatic rollback)
  backup             Backup database, uploads and .env  (keeps the last ${BACKUP_KEEP})
  restore [file]     Restore a backup created by "backup"
  uninstall          Clean removal of all Leksis components
  status             Show live status of all services
  config             Edit the AI engine (local Ollama / remote Ollama / OpenAI-compatible API) and models
  logs [service]     Follow the logs of a service

Options:
  -y, --yes          Non-interactive: never ask, use answers or defaults
      --answers FILE Read answers from FILE (LEKSIS_<KEY>=value lines)
      --dir DIR      Installation directory (default ${DEFAULT_INSTALL_DIR})
      --no-tui       Plain-text prompts (also: LEKSIS_NO_TUI=1)
  -V, --version      Print the version
  -h, --help         Show this help

Run without a command to open the interactive menu.

Unattended install example:
  cat > answers.env <<'ANS'
  LEKSIS_ACCESS_MODE=https          # http | https | proxy
  LEKSIS_APP_HOST=leksis.example.com   # the domain (https mode)
  LEKSIS_ADMIN_EMAIL=admin@example.com
  LEKSIS_AI_MODE=openai
  LEKSIS_AI_URL=http://192.168.1.50:8000/v1
  LEKSIS_AI_API_KEY=sk-...          # optional
  ANS
  sudo ./install.sh --yes --answers answers.env install

Answer keys: INSTALL_DIR REPO_URL ACCESS_MODE (http|https|proxy) APP_HOST (domain, https) ACCESS_FALLBACK ACCESS_TRUSTED
ADMIN_EMAIL ADMIN_NAME AI_MODE
(local|remote|openai) AI_URL AI_API_KEY GPU_VENDOR (nvidia|amd|none) SAME_MODEL_FOR_ALL (y|n) OLLAMA_MODEL OLLAMA_OCR_MODEL
OLLAMA_REWRITE_MODEL (the model ids, for any engine) POSTGRES_PASSWORD PULL_REMOTE_MODELS UPDATE_COMPONENTS (e.g. "app caddy")
CONFIRM_DELETE CONFIRM_RESTORE. Prefix each with LEKSIS_.
Ollama runtime overrides (not asked at install; editable with "config"):
OLLAMA_KEEP_ALIVE (default -1)  OLLAMA_SCHED_SPREAD (true)  OLLAMA_MAX_LOADED_MODELS (3).
EOF
}

# ── Entry point ───────────────────────────────────────────────
main() {
  local -a args=()
  while [[ $# -gt 0 ]]; do
    case "$1" in
      -y|--yes)      NONINTERACTIVE=true ;;
      --answers)     [[ $# -ge 2 ]] || { echo "ERROR: --answers needs a file" >&2; exit 1; }
                     ANSWERS_FILE="$2"; shift ;;
      --dir)         [[ $# -ge 2 ]] || { echo "ERROR: --dir needs a path" >&2; exit 1; }
                     export LEKSIS_INSTALL_DIR="$2"; shift ;;
      --no-tui)      NO_TUI=true ;;
      -V|--version)  echo "$VERSION"; exit 0 ;;
      -h|--help)     usage; exit 0 ;;
      *)             args+=("$1") ;;
    esac
    shift
  done
  set -- ${args[@]+"${args[@]}"}
  local cmd="${1:-menu}"

  # Interactive prompts need a terminal ("curl … | bash" would eat stdin)
  if ! $NONINTERACTIVE && [[ ! -t 0 ]]; then
    echo ""
    echo "ERROR: stdin is not a terminal -- interactive prompts will not work."
    echo ""
    echo "Run this script with:"
    echo "  bash <(curl -fsSL ${RAW_URL})"
    echo ""
    echo "Or download it first:"
    echo "  curl -fsSL ${RAW_URL} -o install.sh"
    echo "  chmod +x install.sh && sudo ./install.sh"
    echo ""
    echo "For unattended use add --yes (see --help)."
    exit 1
  fi

  setup_terminal
  trap 'on_error $? $LINENO' ERR
  trap 'exit 130' INT
  check_root
  init_logging "$cmd"
  [[ -n "$ANSWERS_FILE" ]] && load_answers_file "$ANSWERS_FILE"
  map_answer_aliases
  detect_pkg_manager
  ensure_base_deps
  ensure_gum

  case "$cmd" in
    install)   cmd_install ;;
    update)    cmd_update ;;
    uninstall) cmd_uninstall ;;
    status)    cmd_status ;;
    config)    cmd_config ;;
    backup)    cmd_backup ;;
    restore)   cmd_restore "${2:-}" ;;
    logs)      cmd_logs "${2:-}" ;;
    menu)      show_menu ;;
    *)         p_err "Unknown command: ${cmd}"; usage; exit 1 ;;
  esac
}

# Sourced by tests: LEKSIS_SOURCE_ONLY=1 source install.sh
# "main; exit" on ONE line: bash must never read the file again after main
# returns (git checkout during "update" rewrites this very script).
[[ "${LEKSIS_SOURCE_ONLY:-}" == "1" ]] && return 0 2>/dev/null
main "$@"; exit $?

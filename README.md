# 🧠 Leksis

**AI-powered translation & rewriting — on-premise, no cloud dependency.**

Leksis is a self-hosted, all-in-one platform for text translation, document processing, OCR, and AI-assisted rewriting. Built for organizations that need powerful language tools **without sending data to the cloud**.

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-18-336791?logo=postgresql&logoColor=white)
![Caddy](https://img.shields.io/badge/Caddy-v2-00ADD8?logo=caddy&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)
![Ollama](https://img.shields.io/badge/Ollama-local_LLM-black)

---

## 🎉 What's new

### v1.2.0 (in development)
- **Choose your AI engine** — Ollama (local container or another server) **or any OpenAI-compatible API**: vLLM, LM Studio, llama.cpp, OpenRouter, OpenAI… Pick it at install time (`leksis install` / `leksis config`) or in **Admin → Services → AI**
- **Private by default** — an AI server outside your private network is blocked until an admin explicitly ticks *Allow servers outside the private network*; API keys are stored encrypted and never exported
- The admin only shows the actions the engine supports (model download, VRAM loading and deletion are Ollama-only)

### v1.1.0-beta.4 (beta)
- Installer: the OCR and rewrite models default to the chosen translation model; keep alive (`-1`), GPU spread (`true`) and max loaded models (`3`) are no longer asked — they can be edited later with `leksis config`
- Installer: fixed the wrong "space = toggle" hint in the component picker (gum uses `x`)

### v1.1.0-beta.3 (beta)
- Fix: `update` no longer aborts with "local changes would be overwritten" on `install.sh` (file-mode changes are ignored; real local edits are stashed and can be restored with `git stash pop`)
- The `leksis` command is now a small launcher script instead of a symlink

### v1.1.0-beta.2 (beta)
- **Admin → Services → AI**: model fields are now dropdowns (installed models, suggested ones such as `translategemma:27b` / `12b` / `4b`, or a custom name). Picking a model that is not installed offers **Download and use** — progress bar, then the configuration is saved automatically
- Installer: translation model chosen from a list, progress bars for image / model downloads and the app build, screen cleared on the main menu, fix for default values starting with `-` in the terminal UI

### v1.1.0-beta.1 (beta)
- **Ollama is now optional** — install it as a container on the Leksis server, or point Leksis at an Ollama server running elsewhere (local container = compose profile `ollama`)
- **New installer UI** — terminal UI powered by [gum](https://github.com/charmbracelet/gum) (checksum-verified, automatic plain-text fallback), system pre-checks, install summary before anything is changed, resumable after a reboot
- New commands: `backup` / `restore` (database + uploads + `.env`, rotation), `leksis` shortcut, unattended mode (`--yes`, `--answers`)
- `update` now takes a backup first, really pulls new `caddy` / `postgres` / `ollama` images, and rolls back automatically if the app does not come back healthy
- `config` can switch Ollama between local and remote and keeps the admin panel settings in sync
- Existing installs are migrated automatically on the next `update` / `config`

### v1.0.6
- Update: `install.sh` now selects the latest **stable** release tag and ignores pre-release tags (`-beta.N`); installs already on a pre-release follow the beta channel

### v1.0.5
- Fix: PostgreSQL `PGDATA` pinned so the container no longer crashes on existing data volumes
- Backup export/import now includes glossaries and strips non-portable branding fields
- Admin dashboard shows the running app version

### v1.0.0

First public release of Leksis.

- **Text translation** — free text with language auto-detection, formality control, and source ↔ target swap
- **Document Studio** — full document translation (PDF, DOCX, TXT, CSV) with structure preservation
- **OCR & Image translation** — vision-based text extraction from scanned docs and photos
- **AI Rewriting** — reformulation and grammar correction with configurable tones and glossary integration
- **Admin panel** — full web UI for branding, models, users, glossary, audit log, and service health
- **On-premise first** — no cloud dependency, no API keys, fully self-hosted via Docker

---

## ✨ Features

### 📝 Text Translation
Translate free text between dozens of languages with automatic source detection. Supports formality control (formal / informal) when translating from English, and instant **source ↔ target swap** with re-translation.

### 📄 Document Studio
Upload a full document and get a translated version — structure preserved. Supports **PDF, DOCX, TXT, and CSV**. Text extraction and translation happen entirely server-side, with segment-level fidelity via structured `|||` separators.

### 🖼️ OCR & Image Translation
Extract text from scanned documents, screenshots, or photos using **Ollama vision models**. Tables are rendered in Markdown. The extracted text can immediately be routed to the translation engine in a single workflow.

### ✍️ AI Rewriting
Rewrite or proofread any text in its original language. Choose between **Rewrite** (full reformulation) and **Correct only** (grammar & spelling). Pick a tone — up to 6 fully configurable styles — and control output length (Shorter / Keep / Longer). Glossary integration ensures consistent terminology.

---

## 🧱 Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 |
| Language | TypeScript 5 |
| Styling | Tailwind CSS v4 (CSS-first `@theme`) |
| AI Backend | Ollama (`/api/generate`) or any OpenAI-compatible API (`/v1/chat/completions`) — local or remote |
| Database | PostgreSQL 18 via `pg` |
| Reverse proxy | Caddy v2 — HTTP/HTTPS, hot-reload via admin API |
| Auth | next-auth v5 — OTP email-free login |
| Encryption | AES-256-GCM (DB credentials at rest) |
| Document parsing | `pdf-parse`, `mammoth`, `@napi-rs/canvas` |
| Containerization | Docker + Docker Compose |

---

## 🚀 Quick Start

### Prerequisites

| Requirement | Minimum |
|---|---|
| OS | Ubuntu 22.04 / Debian 12 / Debian 13 (bare-metal or VM) |
| CPU | 4 cores |
| RAM | 8 GB (16 GB recommended for LLM inference) |
| Disk | 40 GB free (model storage varies) |
| Docker | ≥ 24.0 + Compose plugin ≥ 2.20 (installed by the script if missing) |
| AI engine | Ollama ≥ 0.4 (container or existing server) **or** any OpenAI-compatible API |
| Network | Internet access during install (Docker pull, model download) |

> GPU is optional — CPU inference works but is significantly slower. NVIDIA and AMD variants available. With a remote Ollama server, no GPU is needed on the Leksis machine (and 15 GB of disk is enough).

### One-line install

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Mandrhax/Leksis/v1.1.0-beta.4/install.sh)
```

> ⚠️ Use `bash <(curl ...)` — **not** `curl ... | bash`. The installer is interactive.

The installer downloads a small terminal-UI helper ([gum](https://github.com/charmbracelet/gum), pinned and checksum-verified). If it cannot (no internet, unsupported CPU) or you pass `--no-tui`, it falls back to plain-text prompts.

### Script commands

After the first install, the script is available everywhere as `leksis` (run as root).

```bash
leksis install          # Full guided installation on a fresh server
leksis update           # Backup, update to the latest release tag, rollback if unhealthy
leksis status           # Live status of all services and models
leksis config           # Models, Ollama local ↔ remote, PostgreSQL version…
leksis logs [service]   # Follow logs (app, caddy, postgres, ollama)
leksis backup           # Database + uploads + .env  →  <install dir>/backups/
leksis restore [file]   # Restore a backup
leksis uninstall        # Clean removal of all Leksis components
```

### AI engine: Ollama or an OpenAI-compatible API

The installer asks which AI engine Leksis should use:

- **Local Ollama** — an `ollama` container on the Leksis server (GPU auto-detected).
- **Remote Ollama** — an Ollama server you already run. Enter its URL; the installer tests it, lists the missing models and can pull them for you. On that machine Ollama must listen on the network (`OLLAMA_HOST=0.0.0.0`) — its API has no authentication, keep it on a trusted network. For an Ollama on the *same* host as Leksis, `http://localhost:11434` is rewritten to `host.docker.internal`.
- **OpenAI-compatible API** — vLLM, LM Studio, llama.cpp, OpenRouter, OpenAI… Enter the API base URL (e.g. `http://192.168.1.50:8000/v1`) and, if needed, an API key. The installer lists the models the API serves so you can pick them; nothing is downloaded.

Switch later with `leksis config` or in **Admin → Services → AI** (where the API key can also be changed). An engine **outside your private network** is blocked until an admin ticks *Allow servers outside the private network* in that page — your users' texts would then leave your network. Under the hood the local Ollama container is the Docker Compose profile `ollama` (`COMPOSE_PROFILES=ollama` in `.env`); `AI_PROVIDER`, `AI_BASE_URL` and `AI_API_KEY` select the engine.

### Unattended install

```bash
cat > answers.env <<'EOF'
LEKSIS_APP_HOST=leksis.example.com
LEKSIS_ADMIN_EMAIL=admin@example.com
LEKSIS_AI_MODE=openai
LEKSIS_AI_URL=http://192.168.1.50:8000/v1
LEKSIS_AI_API_KEY=sk-...   # optional
EOF
sudo ./install.sh --yes --answers answers.env install
```

See `./install.sh --help` for every answer key. The install log is written to `/var/log/leksis-install.log`.

### GPU support

`install.sh` detects NVIDIA and AMD GPUs (local Ollama only) and selects the right overlay automatically. To use one manually, layer it on top of the base file:

```bash
docker compose -f docker-compose.yml -f docker-compose.nvidia.yml up -d   # NVIDIA
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d      # Generic NVIDIA GPU
docker compose -f docker-compose.yml -f docker-compose.amd.yml up -d      # AMD (ROCm)
```

---

## ⚙️ Configuration

`install.sh` generates the `.env` for you. To configure manually, copy `.env.production.example` to `.env` and fill in the values:

```env
# PostgreSQL
POSTGRES_PASSWORD=changeme
POSTGRES_VERSION=18          # changing it on an existing install requires a data migration
DATABASE_URL=postgresql://leksis_user:changeme@postgres:5432/leksis

# NextAuth
AUTH_SECRET=your-secret-here # openssl rand -base64 32
AUTH_TRUST_HOST=1            # required when running behind a reverse proxy
NEXTAUTH_URL=https://your-domain.com

# Caddy reverse proxy
CADDY_HOST=your-domain.com   # bare IP = HTTP only; domain = HTTPS via Let's Encrypt

# Encryption key for DB credentials (AES-256-GCM)
ENCRYPTION_KEY=your-64-hex-char-key   # openssl rand -hex 32

# Ollama — local container (default) …
COMPOSE_PROFILES=ollama      # empty = no Ollama container (remote server)
OLLAMA_BASE_URL=http://ollama:11434   # … or e.g. http://192.168.1.50:11434 for a remote server
OLLAMA_MODEL=translategemma:27b
OLLAMA_OCR_MODEL=maternion/LightOnOCR-2:latest
OLLAMA_REWRITE_MODEL=qwen2.5:14b
OLLAMA_KEEP_ALIVE=-1
OLLAMA_SCHED_SPREAD=true
OLLAMA_MAX_LOADED_MODELS=3
```

All settings (branding, features, tones, limits, Caddy host, `NEXTAUTH_URL`) are managed from the **Admin panel** at `/admin` — no config file edits required after initial setup.

---

## 🐳 Docker Architecture

Leksis runs as **3 or 4 containers** (the Ollama one is optional) on an isolated Docker network (`leksis-net`):

| Container | Image | Role | Exposed ports |
|---|---|---|---|
| `leksis-caddy` | `caddy:2-alpine` | Reverse proxy — only public entry point | 80, 443 |
| `leksis-app` | `leksis-app` (built locally) | Next.js application | internal only |
| `leksis-postgres` | `postgres:${POSTGRES_VERSION}-alpine` | Database | internal only |
| `leksis-ollama` *(optional)* | `ollama/ollama:latest` | LLM inference — skipped with a remote Ollama | internal only |

The app container is **never directly exposed** — all traffic flows through Caddy. Caddy's admin API (`port 2019`) is accessible only within the Docker network, allowing hot-reload of the proxy configuration from the admin panel without restarting any container.

### Behind an existing proxy (NPM, Traefik…)

If you already have an external proxy handling SSL termination, enable **Behind a reverse proxy** in the admin Caddy panel (or set `CADDY_HOST=:80`) so Caddy listens on all interfaces and preserves the `X-Forwarded-Proto` / `X-Forwarded-Host` headers. Make sure your upstream proxy sends them and set `AUTH_TRUST_HOST=1` in `.env`.

---

## 🤖 AI Models

Leksis delegates all AI work to **one AI engine** for the three features (translation, rewriting, OCR):

| Engine | Where | Notes |
|---|---|---|
| **Ollama** | container on the Leksis server, or an Ollama server elsewhere | model download, deletion and VRAM loading from the admin |
| **OpenAI-compatible API** | vLLM, LM Studio, llama.cpp, LocalAI, OpenRouter, OpenAI… | optional API key; models are the ids served by the API (`GET /v1/models`) |

Default Ollama models:

| Model | Role |
|---|---|
| `translategemma:27b` | Text & document translation |
| `maternion/LightOnOCR-2:latest` | OCR — vision-based text extraction |
| `qwen2.5:14b` | AI rewriting & correction |

With Ollama or an API on your own network, models run **on your infrastructure**: no usage quotas, no data leaving your network. An engine outside your private network is **blocked by default** — enable it explicitly in *Admin → Services → AI* (your users' texts will then leave your network).

> OCR needs a vision-capable model. With an OpenAI-compatible server, check that the model you serve handles images and that its chat template suits the prompts (TranslateGemma on vLLM, for instance, may need testing).

---

## 🌍 Internationalization

The Leksis UI is fully translated in **4 languages**:

| 🇬🇧 English | 🇩🇪 Deutsch | 🇫🇷 Français | 🇮🇹 Italiano |
|---|---|---|---|

Users switch the UI language instantly with the language selector — preference is saved locally.

Translation targets cover **dozens of languages** with alphabetically sorted dropdowns and starred favorites.

---

## 🔐 Security

- **Caddy reverse proxy** — the app container is never directly exposed; only ports 80/443 are bound to the host
- **OTP authentication** — no passwords stored; codes are generated and displayed inline (on-premise, no email relay required)
- **AES-256-GCM encryption** — database credentials are encrypted at rest
- **Server-only AI calls** — Ollama is never reachable from the browser; all requests go through the Next.js API layer
- **Admin guard** — every admin route and page enforces role-based access via `requireAdmin()`
- **Audit log** — every significant action is recorded in a paginated audit table

---

## 📸 Screenshots
<img width="1794" height="857" alt="image" src="https://github.com/user-attachments/assets/87fea57b-2a73-4913-b6ea-89b420a351a6" />

<img width="1794" height="857" alt="image" src="https://github.com/user-attachments/assets/022de1f2-6182-424f-9d86-b9d9e5c94e8d" />

<img width="1794" height="857" alt="image" src="https://github.com/user-attachments/assets/b923b2c0-6574-4a24-8f8e-77451b4e41ba" />


---

## 📄 License

Private — all rights reserved. For licensing inquiries, contact the project maintainer.

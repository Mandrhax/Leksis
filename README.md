# 🧠 Leksis

**AI-powered translation & rewriting — on-premise, no cloud dependency.**

Leksis is a self-hosted, all-in-one platform for text translation, document processing, OCR, and AI-assisted rewriting. Built for organizations that need powerful language tools **without sending data to the cloud**.

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-18-336791?logo=postgresql&logoColor=white)
![Caddy](https://img.shields.io/badge/Caddy-v2-00ADD8?logo=caddy&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)
![Ollama](https://img.shields.io/badge/Ollama-local_LLM-black)
![OpenAI API](https://img.shields.io/badge/OpenAI--compatible-vLLM_%C2%B7_LM_Studio_%C2%B7_llama.cpp-412991)

**Contents** — [Highlights](#-highlights) · [Features](#-features) · [Quick start](#-quick-start) · [AI engines](#-ai-engines) · [Managing your installation](#-managing-your-installation) · [Configuration](#-configuration) · [Architecture](#-architecture) · [Security](#-security--privacy) · [Troubleshooting](#-troubleshooting) · [Development](#-development) · [What's new](#-whats-new)

---

## ✨ Highlights

- **Four tools, one appliance** — text translation, document translation, OCR, and AI rewriting
- **Your choice of AI engine** — Ollama (container on the server, or another server) **or any OpenAI-compatible API** such as vLLM, LM Studio or llama.cpp
- **Private by default** — an AI server outside your private network is blocked until an administrator explicitly allows it
- **Guided installer** — a single command sets up Docker, GPU drivers, the database, HTTPS and the AI models, with a terminal UI, backups and one-command updates with automatic rollback
- **Full admin web UI** — branding, models, users, glossaries, tones, limits, audit log and live service health
- **Multilingual UI** — English, German, French and Italian

---

## 📚 Features

### 📝 Text Translation
Translate free text between dozens of languages with automatic source detection. Supports formality control (formal / informal) when translating from English, and instant **source ↔ target swap** with re-translation. The result stays editable and reusable.

### 📄 Document Studio
Upload a full document and get a translated version — structure preserved. Supports **PDF, DOCX, TXT, and CSV**. Text extraction and translation happen entirely server-side, with segment-level fidelity via structured `|||` separators. Scanned PDFs are read page by page with a vision model.

### 🖼️ OCR & Image Translation
Extract text from scanned documents, screenshots, or photos using a **vision model**. Tables are rendered in Markdown, and stats (detected language, word count) are shown. The extracted text can immediately be routed to the translation engine in a single workflow.

### ✍️ AI Rewriting
Rewrite or proofread any text in its original language. Choose between **Rewrite** (full reformulation) and **Correct only** (grammar & spelling). Pick a tone — up to 6 fully configurable styles with multilingual labels — and control output length (Shorter / Keep / Longer). Glossary integration ensures consistent terminology.

### 🛠️ Admin panel
| Section | What you can do |
|---|---|
| **Dashboard** | Live health of the AI engine, PostgreSQL and Caddy, usage and activity at a glance |
| **Settings** | Identity, appearance (logo, colors, background, dark mode), features & limits, AI tones, access, maintenance mode, global banner |
| **Services → AI** | Choose the AI engine, server URL, API key and models; test the connection; download / delete / preload models (Ollama) |
| **Services → PostgreSQL / Caddy** | PostgreSQL connection settings and metrics; Caddy **access mode** (HTTP / HTTPS with a domain / behind a reverse proxy), certificate status and live reload |
| **Glossary** | Named glossaries with language pairs, CSV import / export, per-user toggles |
| **Users** | User list and admin roles |
| **Usage** | AI usage statistics, filterable, CSV export, purge |
| **Audit** | Paginated journal of every significant admin action |
| **Backup** | Export / import of the whole configuration (JSON) |

---

## 🚀 Quick Start

### Requirements

| Requirement | Minimum |
|---|---|
| OS | Ubuntu 22.04 / Debian 12 / Debian 13 (bare-metal or VM), run as **root** |
| CPU | 4 cores |
| RAM | 8 GB (16 GB recommended for local LLM inference) |
| Disk | 40 GB free with a local Ollama (model storage varies) — 15 GB with a remote AI engine |
| Docker | ≥ 24.0 with Compose plugin ≥ 2.20 (installed by the script if missing) |
| AI engine | Ollama ≥ 0.4 (container or existing server) **or** any OpenAI-compatible API |
| Network | Internet access during install (Docker images, model download) |

> A GPU is optional — CPU inference works but is much slower. NVIDIA and AMD are detected automatically (local Ollama only). With a remote AI engine, the Leksis machine needs no GPU at all.

### Install

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Mandrhax/Leksis/v1.5.0-beta.5/install.sh)
```

> ⚠️ Use `bash <(curl ...)` — **not** `curl ... | bash`. The installer is interactive.

The installer:

1. checks the system (OS, CPU, RAM, disk, ports, DNS) and asks its questions **before changing anything** — paths, how users reach Leksis (HTTP / HTTPS domain / behind a reverse proxy), admin account, AI engine, models, database password;
2. shows a summary, then installs Docker and GPU drivers if needed, clones the release, generates the secrets and the `.env`, builds and starts the containers (with progress bars);
3. pulls the AI models when they are missing, creates the admin user and tests the application.

A small terminal-UI helper ([gum](https://github.com/charmbracelet/gum), pinned and checksum-verified) is downloaded for the menus. If it cannot be (no internet, unsupported CPU) or you pass `--no-tui`, the installer falls back to plain-text prompts. If a NVIDIA driver installation requires a reboot, re-run the installer afterwards: it offers to **resume** with your saved answers.

### First sign-in

Open the URL shown at the end of the installation and enter the admin e-mail you gave. Leksis uses **OTP authentication without an e-mail relay**: the code is displayed inline on the sign-in page (on-premise design). Then head to **Admin** (`/admin`) to set branding, glossaries and limits.

---

## 🤖 AI engines

Leksis uses **one AI engine for all three AI features** (translation, rewriting, OCR). Choose it during installation, with `leksis config`, or in **Admin → Services → AI**.

| Engine | Where it runs | What the admin can do |
|---|---|---|
| **Ollama — local** | container on the Leksis server (GPU auto-detected) | download / delete models, preload into VRAM, unload |
| **Ollama — remote** | an Ollama server you already run | same as above, on that server |
| **OpenAI-compatible API** | vLLM, LM Studio, llama.cpp, LocalAI, OpenRouter, OpenAI… | pick among the models the API serves; optional API key |

### Ollama

- The installer proposes `translategemma:27b` / `12b` / `4b` for translation (the OCR and rewrite models default to the same model — change them freely). With a small GPU, choose a smaller size.
- **Remote Ollama** must listen on the network (`OLLAMA_HOST=0.0.0.0`). Its API has **no authentication** — keep it on a trusted network. An Ollama on the *same* host as Leksis (`http://localhost:11434`) is reached through `host.docker.internal`.
- Missing models can be downloaded by the installer (progress bar) or from the admin (**Download and use** on a model that is not installed yet).

### OpenAI-compatible API

- Enter the API **base URL** (e.g. `http://192.168.1.50:8000/v1` — a bare `http://host:8000` is completed with `/v1`) and, if the server needs one, an **API key**.
- Models are the ids returned by `GET /v1/models`; nothing is downloaded by Leksis. For the OCR, serve a **vision-capable** model.
- The API key is stored **encrypted (AES-256-GCM)**, is never sent back to the browser, never written to the audit log and never exported. Changing the server address drops the saved key so it cannot be sent to another host by mistake.
- Prompts are sent as chat messages. Some models depend on a specific chat template (TranslateGemma on vLLM, for instance) — compare the output quality with Ollama before relying on it.

### Private by default

An AI server **outside your private network** (public IP or domain) is **blocked**: saving such a URL is refused and requests are rejected until an administrator ticks **Allow servers outside the private network** in *Admin → Services → AI*. Doing so means your users' texts leave your network. Private addresses (`10.x`, `172.16–31.x`, `192.168.x`, loopback, `100.64/10`, `.local` / `.lan` / `.internal` names and single-label Docker names) are always allowed.

### Default models

| Model | Role |
|---|---|
| `translategemma:27b` | Text & document translation |
| `maternion/LightOnOCR-2:latest` | OCR — vision-based text extraction |
| `qwen2.5:14b` | AI rewriting & correction |

---

## 🧰 Managing your installation

After the first install, the script is available everywhere as **`leksis`** (run as root). Without argument it opens an interactive menu.

| Command | What it does |
|---|---|
| `leksis install` | Full guided installation on a fresh server |
| `leksis update` | Backs up, switches to the latest release, rebuilds the selected components and **rolls back automatically** if the app does not come back healthy |
| `leksis status` | Version, URL, containers, AI engine and models, disk usage, recent logs |
| `leksis config` | Change the AI engine (local Ollama ↔ remote Ollama ↔ OpenAI-compatible API), models, Ollama runtime settings, PostgreSQL version |
| `leksis logs [service]` | Follow the logs of `app`, `caddy`, `postgres` or `ollama` |
| `leksis backup` | Database + uploaded logo/background + `.env` → `<install dir>/backups/` (the 7 most recent are kept) |
| `leksis restore [file]` | Restore a backup (typed confirmation; a safety backup of the current state is taken first) |
| `leksis uninstall` | Clean removal; asks whether to keep the data volumes and keeps a copy of your backups in `/var/backups/leksis` |

Options for every command: `-y/--yes` (never ask), `--answers FILE`, `--dir DIR`, `--no-tui`, `-h/--help`, `-V/--version`.

### Updates

`leksis update` fetches the release tags, shows the current and latest versions, lets you pick the components to update (`app`, `caddy`, `postgres`, `ollama`, models), takes a backup, then applies them. New images are really pulled, and if the application is unhealthy afterwards, the previous version is restored (the pre-update backup is kept). Existing installations are migrated automatically (`.env` keys, AI engine settings).

### Release channels

Installations follow the **stable** channel (tags `vX.Y.Z`). To test pre-releases (`vX.Y.Z-beta.N`), install from a beta tag, or set `LEKSIS_CHANNEL=beta` — a beta installation follows the betas, then the next stable release. Try betas on a separate machine, never on production.

### Unattended install

```bash
cat > answers.env <<'EOF'
LEKSIS_APP_HOST=leksis.example.com
LEKSIS_ADMIN_EMAIL=admin@example.com
LEKSIS_AI_MODE=openai                    # local | remote | openai
LEKSIS_AI_URL=http://192.168.1.50:8000/v1
LEKSIS_AI_API_KEY=sk-...                 # optional
EOF
sudo ./install.sh --yes --answers answers.env install
```

Every question has an answer key (`LEKSIS_<KEY>`): `INSTALL_DIR`, `REPO_URL`, `APP_HOST`, `ADMIN_EMAIL`, `ADMIN_NAME`, `AI_MODE`, `AI_URL`, `AI_API_KEY`, `GPU_VENDOR`, `OLLAMA_MODEL`, `OLLAMA_OCR_MODEL`, `OLLAMA_REWRITE_MODEL`, `POSTGRES_PASSWORD`, … — see `./install.sh --help`. Destructive commands still require their typed confirmation (`LEKSIS_CONFIRM_DELETE=DELETE`, `LEKSIS_CONFIRM_RESTORE=RESTORE`). The install log is written to `/var/log/leksis-install.log`.

### GPU support

`install.sh` detects NVIDIA and AMD GPUs (local Ollama only), installs the drivers / container toolkit when needed and selects the right compose overlay. To use one manually, layer it on top of the base file:

```bash
docker compose -f docker-compose.yml -f docker-compose.nvidia.yml up -d   # NVIDIA
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d      # Generic NVIDIA GPU
docker compose -f docker-compose.yml -f docker-compose.amd.yml up -d      # AMD (ROCm)
```

---

## 🔧 Configuration

`install.sh` generates the `.env` for you (`chmod 600`). To configure manually, copy `.env.production.example` to `.env` and fill in the values.

| Variable | Purpose |
|---|---|
| `COMPOSE_PROJECT_NAME` / `COMPOSE_FILE` / `COMPOSE_PROFILES` | Compose project, GPU overlay, and `ollama` to run the local Ollama container (empty = no container) |
| `POSTGRES_PASSWORD` / `POSTGRES_VERSION` / `DATABASE_URL` | PostgreSQL account and version (changing the major version needs a data migration) |
| `AUTH_SECRET` / `NEXTAUTH_URL` | Session signing (`openssl rand -base64 32`); `NEXTAUTH_URL` should stay **empty** (the public address is detected) — set it only to pin one fixed address |
| `CADDY_HOST` | `:80` = HTTP or behind a reverse proxy; a domain name = HTTPS via Let's Encrypt (managed from the admin / `leksis config`) |
| `ENCRYPTION_KEY` | AES-256-GCM key, 64 hex characters (`openssl rand -hex 32`) — needed to read encrypted settings, **keep it in your backups** |
| `AI_PROVIDER` / `AI_BASE_URL` / `AI_API_KEY` | AI engine: `ollama` or `openai`, server URL, optional API key |
| `OLLAMA_MODEL` / `OLLAMA_OCR_MODEL` / `OLLAMA_REWRITE_MODEL` | The three model ids (whatever the engine) |
| `OLLAMA_IMAGE` / `OLLAMA_KEEP_ALIVE` / `OLLAMA_SCHED_SPREAD` / `OLLAMA_MAX_LOADED_MODELS` | Local Ollama container only (`-1` / `true` / `3` by default) |

Everything else — branding, features, limits, tones, glossaries, Caddy host, `NEXTAUTH_URL`, and the AI engine itself — is managed from the **Admin panel** at `/admin`. Once you save the AI engine in the admin, the admin's settings take precedence over the `.env` values (`leksis config` keeps both in sync).

---

## 🧱 Architecture

```
Internet / your reverse proxy
        │  :80 / :443
   ┌────▼─────┐      ┌──────────────┐      ┌───────────────────────────────┐
   │  Caddy   │─────▶│  Next.js app │─────▶│  AI engine                    │
   └──────────┘      │  (:3000)     │      │  Ollama  or  OpenAI-compat API│
                     └──────┬───────┘      └───────────────────────────────┘
                            │
                     ┌──────▼───────┐
                     │ PostgreSQL   │
                     └──────────────┘
```

Leksis runs as **3 or 4 containers** (the Ollama one is optional) on an isolated Docker network (`leksis-net`):

| Container | Image | Role | Exposed ports |
|---|---|---|---|
| `leksis-caddy` | `caddy:2-alpine` | Reverse proxy — only public entry point | 80, 443 |
| `leksis-app` | `leksis-app` (built locally) | Next.js application | internal only |
| `leksis-postgres` | `postgres:${POSTGRES_VERSION}-alpine` | Database | internal only |
| `leksis-ollama` *(optional)* | `ollama/ollama:latest` | LLM inference — absent with a remote engine | internal only |

The app container is **never directly exposed** — all traffic flows through Caddy. Caddy's admin API (port 2019) is reachable only within the Docker network, which lets the admin panel hot-reload the proxy configuration without restarting anything. Persistent data lives in named volumes: `postgres_data`, `ollama_data`, `leksis_uploads`, `caddy_data`.

The browser **never talks to the AI engine**: every request goes through the Next.js API layer, which isolates all AI calls behind one provider abstraction (`src/lib/llm/`).

### Access: HTTP, HTTPS or behind a reverse proxy

Leksis detects its own public address from the request headers, so **there is no URL to configure** — you only choose how Caddy is reached. Pick it during installation, in **Admin → Services → Caddy** or with `leksis config` (they all change the same settings, applied live):

| Mode | When to use it | Requirements |
|---|---|---|
| **HTTP** | Intranet, quick start, testing | none — `http://<server address>` |
| **HTTPS with a domain name** | Leksis is reachable from the internet, or by name on your network | a DNS record (A / AAAA) pointing the domain to this server, ports 80 **and** 443 reachable; the certificate is issued automatically by Let's Encrypt |
| **Behind a reverse proxy** | Nginx Proxy Manager, Traefik, another Caddy… already handles your HTTPS | the proxy forwards to `http://<server>:80`, keeps the original `Host` header and sends `X-Forwarded-Proto` |

**Going from HTTP to HTTPS** takes two steps: create the DNS record for your domain, then in *Admin → Services → Caddy* choose *HTTPS with a domain name*, type the domain and save (or `leksis config` → *Change how users reach Leksis*). The same page shows the certificate status until it is issued. While you set it up, *Keep HTTP access by IP address* (on by default) keeps this page reachable even if the certificate cannot be issued yet — turn it off once HTTPS works.

**Behind a reverse proxy** — no extra option to set in the proxy beyond the three points above (Nginx Proxy Manager: point the host to the server's IP and port 80, enable *SSL*, and leave *Websockets* off — it is not needed). A proxy on a private network is trusted automatically; if yours has a public address, add it in the *Proxy address* field so its forwarded headers are honoured. Nothing needs to be entered as `NEXTAUTH_URL`: leave it empty unless you want to pin one fixed address.

---

## 🔐 Security & privacy

- **No cloud by default** — with Ollama or an API on your own network, texts never leave your infrastructure
- **External AI servers blocked** unless an admin explicitly allows them (see [AI engines](#-ai-engines))
- **Reverse proxy** — the app container is never directly exposed; only ports 80/443 are bound to the host
- **OTP authentication** — no passwords stored; codes are shown inline (no e-mail relay required)
- **AES-256-GCM** — database credentials and the AI API key are encrypted at rest; the key is never returned to the browser, exported or logged
- **Server-only AI calls** — the AI engine is never reachable from the browser
- **Admin guard** — every admin route and page enforces role-based access
- **Audit log** — every significant action is recorded (secrets are redacted)
- **Secrets** — the installer generates `AUTH_SECRET` and `ENCRYPTION_KEY`; the `.env` is `chmod 600`, and backups (which contain it) are `chmod 600` too

---

## 🩺 Troubleshooting

| Symptom | What to check |
|---|---|
| Something failed during install | `/var/log/leksis-install.log`; re-run the installer — it resumes with saved answers |
| The site does not answer | `leksis status`, then `leksis logs app` / `leksis logs caddy` |
| HTTPS certificate not issued | The domain must resolve to the server and ports 80 and 443 must be reachable from the internet; Admin → Services → Caddy shows the certificate status, and `leksis logs caddy` the details |
| Redirects to the server IP, sign-in loop or wrong redirects behind a proxy | A pinned `NEXTAUTH_URL` (older installs) overrides the detected address: run `leksis config` (it offers to remove it) or `leksis update`. Also make the proxy forward the original `Host` and `X-Forwarded-Proto`, and choose *Behind a reverse proxy* in Admin → Services → Caddy (add the proxy address if it is not on a private network) |
| "AI server unreachable" | Admin → Services → AI → *Test connection*. A remote Ollama must listen on the network (`OLLAMA_HOST=0.0.0.0`) |
| Saving the AI server is refused | The address is outside your private network — tick *Allow servers outside the private network* if that is intended |
| A model is "not listed by the server" | With an OpenAI-compatible API, use the exact id returned by `/v1/models` |
| Translation quality differs between engines | Chat templates differ per server and model — compare Ollama and the API on the same text |
| The NVIDIA driver installation asked for a reboot | Reboot, then re-run `leksis install` (or the one-liner) and accept to resume |
| An update failed | The previous version is restored automatically; the pre-update backup is in `<install dir>/backups/` (`leksis restore`) |

---

## 💻 Development

```bash
npm install
npm run dev      # → http://localhost:3000
npm run build    # production build check
```

Copy your AI engine settings into `.env.development.local` (e.g. `AI_PROVIDER=ollama`, `AI_BASE_URL=http://localhost:11434`, the three `OLLAMA_*_MODEL` ids) and a PostgreSQL `DATABASE_URL` (the schema is in `docker/init-schema.sql`). Releases are tagged `vX.Y.Z` (stable) or `vX.Y.Z-beta.N` (pre-release); `main` is stable, heavier work happens on `dev`.

### Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 |
| Language | TypeScript |
| Styling | Tailwind CSS v4 (CSS-first `@theme`) |
| AI backend | Ollama (`/api/generate`) or any OpenAI-compatible API (`/v1/chat/completions`) — local or remote |
| Database | PostgreSQL 18 via `pg` |
| Reverse proxy | Caddy v2 — HTTP/HTTPS, hot reload via admin API |
| Auth | next-auth v5 — OTP e-mail-free login |
| Encryption | AES-256-GCM |
| Validation | zod |
| Document parsing | `pdf-parse`, `mammoth`, `@napi-rs/canvas` |
| Containerization | Docker + Docker Compose |

---

## 🌍 Internationalization

The Leksis UI is fully translated in **4 languages**:

| 🇬🇧 English | 🇩🇪 Deutsch | 🇫🇷 Français | 🇮🇹 Italiano |
|---|---|---|---|

Users switch the UI language instantly with the language selector — the preference is saved locally. Translation targets cover **dozens of languages** with alphabetically sorted dropdowns and starred favorites.

---

## 🎉 What's new

### v1.5.0-beta.5
- Fix: with OpenAI-compatible engines (vLLM in particular), translation/rewrite/correct could stop after the first sentence — vLLM defaults `max_tokens` to 16 when the client doesn't send it explicitly. Leksis now sends an explicit `max_tokens` sized to the input

### v1.5.0-beta.4
- Fix: with some OpenAI-compatible models (e.g. Apertus-8B via vLLM), AI Rewrite/Correct could prepend a leftover sentence from the system prompt (e.g. restating the language/tone instructions) before the actual rewritten text — the prompts now explicitly forbid any preamble

### v1.5.0-beta.3
Rollback of the vLLM / TranslateGemma-specific work from beta.1 and beta.2 — too narrow, and it disabled Document translation and Image extraction.
- The AI engine options are back to local Ollama, remote Ollama, or a generic **OpenAI-compatible API** (vLLM, LM Studio, llama.cpp…), with the same natural-language prompts for every model
- Document translation and Image extraction work again with every AI engine (they were turned off whenever vLLM was selected)
- Installs that ran beta.1/beta.2 are migrated automatically (the `vllm` engine id maps back to the OpenAI-compatible one, in `.env` and in the admin config)
- Kept from beta.1: `install.sh` asks once whether to use the same model for translation, OCR and rewrite (all AI engine modes), and syncs that choice to the admin panel

### v1.4.2
Workspace UI pass: mobile usability, accessibility, and small polish across the four tabs.
- Fix: the mobile header (tabs, help, language switcher, account menu) could overlap into an unreadable jumble on narrow screens — it's now two stacked rows on mobile instead of one overcrowded row
- Language swap is now reachable on mobile (Text tab); workspace panels are shorter on small screens so the mode/tone toolbar needs less scrolling to reach
- Upload zones (Document, Image) are keyboard-accessible; language and account dropdowns close on Escape and stay correctly positioned when the page scrolls or resizes
- A "Retry" action appears next to errors on all four tabs instead of requiring a re-click elsewhere; character counters warn before the hard limit, not just at it
- Image Extraction: click to zoom the source image full-screen, with a "click to change" hint on the thumbnail
- Rewrite tab: hovering a tone now shows what it actually does; the "Rewrite/Correct applied" indicator is more visible
- Streaming output (Text, Rewrite) shows a blinking cursor while generating; empty output panels get an icon instead of plain text
- Removed the random footer quote feature (and its admin toggle) — was FR-only and inconsistent across locales
- Fix: a defensive HTML-escaping gap in Document Studio's (currently unused) raw-HTML block type

### v1.4.1
- *Admin → Backup* now clearly distinguishes the two backup mechanisms: a new "Full server backup" status card explains `leksis backup` is the only one usable with `leksis restore` (database, accounts, history, files, secrets) and shows when it last ran; "Export configuration" is relabeled and its description clarified as a settings/glossary snapshot, not a full backup
- The configuration export now embeds the logo and background image themselves (base64) instead of dropping them — restoring a config no longer loses your branding images
- Fix: on some window heights, "Back to app" and other sidebar items below the fold required scrolling the whole admin page — the sidebar's nav list now scrolls internally instead, keeping "Back to app" always pinned in view

### v1.4.0
A reorganized Settings page, a couple of new settings, and a more useful admin dashboard.

**Admin → Settings**
- Reorganized into tabs (Identity / Appearance / Features & limits / AI tones / General), matching the rest of the admin
- "General" replaces the old "Access" tab name (it never held access-control settings — just contact, banner and maintenance)
- Footer quotes toggle moved next to the other footer settings (Appearance); logo size moved next to the logo upload (Identity); removed the unused "Preview" block from Identity
- The site background is now either a color or an image, picked with a toggle — switching to color removes any previously uploaded background image
- New setting: default tone (informal/formal) for English-source translations, in *Features & limits → Defaults*

**Admin dashboard**
- New backup-status health card — `leksis backup` now records the last successful backup so the dashboard can flag a stale one (older than 8 days, or none at all)
- 7-day AI call trend chart and a breakdown by feature (translate/document/OCR/rewrite), replacing the single "calls today" number
- Wider KPI tiles instead of the narrow stats list

### v1.3.0
Simpler access setup, and a reorganized admin services UI.

**Access & HTTPS**
- **One setting decides how users reach Leksis** — HTTP, HTTPS with a domain name (automatic Let's Encrypt certificate, with a live certificate status) or behind a reverse proxy (NPM, Traefik…). Choose it at install time, in *Admin → Services → Caddy* or with `leksis config`
- The public address is now **detected automatically** from the request headers — `NEXTAUTH_URL` and `AUTH_TRUST_HOST` are no longer needed; `leksis update` and `leksis config` clear any pinned address left by older installs
- Reverse proxies on a private network are trusted automatically; a proxy with a public address can be declared in the admin

**Admin services pages**
- *Admin → Services → AI, PostgreSQL and Caddy* reorganized into tabs (Connection/Access, Models where relevant, Monitoring) instead of a dense two-column layout, removing duplicated status displays
- The Caddy access tab uses two columns — settings on the left, generated Caddyfile preview on the right
- Removed the redundant "Pull a model" form on the AI page — downloading a model not yet installed is already available from each model picker

### v1.2.0
A major update of the AI engine and of the installer.

**AI engine**
- **Choose your AI engine** — Ollama (local container or another server) or **any OpenAI-compatible API** (vLLM, LM Studio, llama.cpp, OpenRouter, OpenAI…), at install time or in *Admin → Services → AI*
- **Private by default** — AI servers outside your private network are blocked until an admin allows them; API keys are encrypted and never exported
- Engine-aware admin page: model dropdowns (installed / suggested / custom), **Download and use** for Ollama, Ollama-only actions hidden for other engines

**Installer**
- New terminal UI (gum, with plain-text fallback), progress bars, system pre-checks, install summary, resumable install
- Ollama is optional; new `backup` / `restore`, unattended mode (`--yes`, `--answers`) and the `leksis` shortcut
- `update` backs up first, pulls new images and rolls back automatically; `config` switches between the three AI engines
- Existing installs are migrated automatically on the next `update` / `config`

### v1.0.6
- `install.sh` selects the latest **stable** release tag and ignores pre-releases (`-beta.N`)

### v1.0.5
- PostgreSQL `PGDATA` pinned so the container no longer crashes on existing data volumes
- Backup export/import includes glossaries and strips non-portable branding fields
- Admin dashboard shows the running app version

### v1.0.0
First public release: text translation, Document Studio, OCR & image translation, AI rewriting, and the admin panel — fully on-premise, no cloud dependency.

---

## 📸 Screenshots

<img width="1794" height="857" alt="image" src="https://github.com/user-attachments/assets/87fea57b-2a73-4913-b6ea-89b420a351a6" />

<img width="1794" height="857" alt="image" src="https://github.com/user-attachments/assets/022de1f2-6182-424f-9d86-b9d9e5c94e8d" />

<img width="1794" height="857" alt="image" src="https://github.com/user-attachments/assets/b923b2c0-6574-4a24-8f8e-77451b4e41ba" />

---

## 📄 License

Private — all rights reserved. For licensing inquiries, contact the project maintainer.

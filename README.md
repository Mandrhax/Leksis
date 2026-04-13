# 🧠 Leksis

**AI-powered translation & rewriting — on-premise, no cloud dependency.**

Leksis is a self-hosted, all-in-one platform for text translation, document processing, OCR, and AI-assisted rewriting. Built for organizations that need powerful language tools **without sending data to the cloud**.

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15+-336791?logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)
![Ollama](https://img.shields.io/badge/Ollama-local_LLM-black)

---

## ✨ Features

### 📝 Text Translation
Translate free text between dozens of languages with automatic source detection. Supports formality control (formal / informal) when translating into French, and instant **source ↔ target swap** with re-translation.

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
| AI Backend | Ollama (`/api/generate`) — local or remote |
| Database | PostgreSQL 15+ via `pg` |
| Auth | next-auth v5 — OTP email-free login |
| Encryption | AES-256-GCM (DB credentials at rest) |
| Document parsing | `pdf-parse`, `mammoth`, `@napi-rs/canvas` |
| Containerization | Docker + Docker Compose |

---

## 🚀 Quick Start

### Prerequisites
- A Linux server (bare-metal) Ubuntu/Debian

### One-line install

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Mandrhax/Leksis/main/install.sh)
```

> ⚠️ Use `bash <(curl ...)` — **not** `curl ... | bash`. The installer is interactive.

### Script commands

```bash
./install.sh install    # Full guided installation on a fresh server
./install.sh update     # Update one or more containers selectively
./install.sh status     # Live status of all services
./install.sh logs       # Tail logs (default: app container)
./install.sh uninstall  # Clean removal of all Leksis components
```

### GPU support

Docker Compose variants are available for GPU-accelerated Ollama inference:

```bash
docker compose -f docker-compose.nvidia.yml up -d   # NVIDIA
docker compose -f docker-compose.gpu.yml up -d      # Generic GPU
docker compose -f docker-compose.amd.yml up -d      # AMD
```

---

## ⚙️ Configuration

Copy `.env.production.example` to `.env.production` and fill in the values:

```env
# Ollama
OLLAMA_BASE_URL=http://your-ollama-host:11434
OLLAMA_MODEL=translategemma:27b
OLLAMA_OCR_MODEL=maternion/LightOnOCR-2
OLLAMA_REWRITE_MODEL=qwen2.5:14b

# PostgreSQL
POSTGRES_HOST=db
POSTGRES_PORT=5432
POSTGRES_DB=leksis
POSTGRES_USER=leksis
POSTGRES_PASSWORD=changeme

# NextAuth
NEXTAUTH_URL=https://your-domain.com
NEXTAUTH_SECRET=your-secret-here

# Encryption key for DB credentials (AES-256-GCM)
ENCRYPTION_KEY=your-32-byte-hex-key
```

All settings (branding, features, tones, limits) are managed from the **Admin panel** at `/admin` — no config file edits required after initial setup.

---

## 🤖 AI Models

Leksis delegates all AI work to **Ollama**. Three models cover the four use cases:

| Model | Role |
|---|---|
| `translategemma:27b` | Text & document translation |
| `maternion/LightOnOCR-2` | OCR — vision-based text extraction |
| `qwen2.5:14b` | AI rewriting & correction |

Models run **locally** on your infrastructure. No API keys, no usage quotas, no data leaving your network.

---

## 🌍 Internationalization

The Leksis UI is fully translated in **4 languages**:

| 🇬🇧 English | 🇩🇪 Deutsch | 🇫🇷 Français | 🇮🇹 Italiano |
|---|---|---|---|

Users switch the UI language instantly with the language selector — preference is saved locally.

Translation targets cover **dozens of languages** with alphabetically sorted dropdowns and starred favorites.

---

## 🔐 Security

- **OTP authentication** — no passwords stored; codes are generated and displayed inline (on-premise, no email relay required)
- **AES-256-GCM encryption** — database credentials are encrypted at rest
- **Server-only AI calls** — Ollama is never reachable from the browser; all requests go through the Next.js API layer
- **Admin guard** — every admin route and page enforces role-based access via `requireAdmin()`
- **Audit log** — every significant action is recorded in a paginated audit table

---

## 📸 Screenshots

> 🚧 Screenshots coming soon.

---

## 📄 License

Private — all rights reserved. For licensing inquiries, contact the project maintainer.

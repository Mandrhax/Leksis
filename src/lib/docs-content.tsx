/* eslint-disable react/jsx-key -- every `items` array below is a fixed, hand-written literal (never
   reordered, filtered or regenerated at runtime), so positional identity is stable without explicit keys. */
import type { ReactNode } from 'react'
import { Callout, Code, CodeBlock, List, P, Sub, Table } from '@/components/admin/docs/DocsPrimitives'

/**
 * Static technical documentation shown at Admin → Docs. English only (technical/ops audience,
 * not part of the translated product UI). Content reflects the app as of v1.8.0 — re-check
 * against the codebase at each stable release rather than relying on this being kept in sync
 * automatically.
 */
export interface DocsSection {
  id: string
  title: string
  icon: string
  body: ReactNode
}

export const DOCS_SECTIONS: DocsSection[] = [
  {
    id: 'overview',
    title: 'Overview',
    icon: 'info',
    body: (
      <>
        <P>
          Leksis is an on-premise / bare-metal AI-assisted translation and rewriting application. It is designed to run
          entirely on infrastructure the customer controls, with no mandatory cloud dependency — text can stay inside the
          private network end to end, depending on how the AI engine is configured (see <Code>Environment variables</Code>{' '}
          and <Code>AI engine setup</Code> below).
        </P>
        <Sub>The four features</Sub>
        <List items={[
          <><strong>Text translation</strong> — free text, source language auto-detection, tone (informal/formal) when the source is English, swap with automatic re-translation, optional voice dictation.</>,
          <><strong>Document translation</strong> — PDF, DOCX, TXT, CSV. Text is extracted server-side, translated in 3000-character segment batches, and the result is re-assembled preserving structure where possible.</>,
          <><strong>OCR (image → text)</strong> — text extraction from images via a vision-capable model, with detected language and word-count stats; the extracted text can optionally be translated (“extract &amp; translate”).</>,
          <><strong>AI rewrite</strong> — reformulation or grammar/spelling correction of existing text without changing language, with configurable tones, length control (shorter/keep/longer) and glossary integration.</>,
        ]} />
        <Sub>Tech stack</Sub>
        <List items={[
          <>Next.js 16 (App Router), TypeScript, React 19 — server-side API integrated in the same app (Backend-for-Frontend).</>,
          <>AI engine: Ollama (<Code>/api/generate</Code>) or any OpenAI-compatible API (<Code>/v1/chat/completions</Code> — vLLM, LM Studio, llama.cpp, OpenAI…), local or remote.</>,
          <>PostgreSQL (via <Code>pg</Code>), zod validation, <Code>@napi-rs/canvas</Code> (PDF → PNG for OCR), <Code>pdf-lib</Code> (legal-page PDF export, no headless browser).</>,
          <>next-auth v5 — JWT sessions, no database adapter.</>,
          <>Caddy v2 as reverse proxy (TLS termination, automatic Let’s Encrypt certificates).</>,
          <>Docker / Docker Compose packaging, deployed and operated via the <Code>install.sh</Code> / <Code>leksis</Code> script.</>,
        ]} />
      </>
    ),
  },
  {
    id: 'architecture',
    title: 'Architecture',
    icon: 'account_tree',
    body: (
      <>
        <Sub>Request flow</Sub>
        <CodeBlock>{`Internet / reverse proxy (SSL)
   ↓
Caddy :80/:443   (container, TLS termination or plain HTTP)
   ↓
app:3000         (Next.js — UI + all server-side API routes)
   ↓
AI engine        Ollama /api/generate  — OR —  OpenAI-compatible /v1/chat/completions
                 (container on the same host, or any reachable server)`}</CodeBlock>
        <Sub>Non-negotiable rules</Sub>
        <List items={[
          <>The browser client <strong>never</strong> calls the AI engine directly — every AI interaction goes through a server-side route under <Code>/api/*</Code>.</>,
          <>System prompts are centralized in a single module (<Code>src/lib/prompts.ts</Code>); the routes and the client never see raw NDJSON/SSE from the engine, only plain text streams.</>,
          <>AI calls are isolated behind one internal interface that both providers implement, so translation, OCR and rewrite share the same code path regardless of which engine is configured.</>,
          <>No secret (API keys, SMTP password, encryption key) is ever exposed to the client, exported, or written to the audit log.</>,
        ]} />
        <Sub>Authentication model</Sub>
        <P>
          next-auth v5 with a Credentials provider (OTP or password) and, optionally, an OIDC SSO provider — see{' '}
          <Code>Authentication &amp; access</Code>. Sessions are JWTs (30-day lifetime) with <strong>no database adapter</strong>;
          there is no server-side session table. The user’s role is embedded in the JWT for performance but is re-read from
          the database on every session read (with a short in-memory cache), so a disabled account or a role change takes
          effect immediately rather than waiting for the token to expire. If the database is unreachable at that moment,
          the role from the token is used as a fallback.
        </P>
      </>
    ),
  },
  {
    id: 'installation',
    title: 'Installation',
    icon: 'download',
    body: (
      <>
        <Sub>Requirements</Sub>
        <List items={[
          <>OS: Ubuntu 22.04, Debian 12 or Debian 13 (other Debian/Ubuntu-family systems get a warning, not a hard stop).</>,
          <>Root access — the installer must run as root.</>,
          <>Disk: ~40 GB free with a local Ollama container (model weights), ~15 GB with a remote AI engine.</>,
          <>Ports 80 and 443 reachable from the internet if using the automatic HTTPS mode (Let’s Encrypt).</>,
          <>Docker is installed automatically by the script (via get.docker.com) if missing.</>,
        ]} />
        <Sub>One-line install</Sub>
        <P>Run as root, from a fresh Linux server:</P>
        <CodeBlock>{`bash <(curl -fsSL https://raw.githubusercontent.com/Mandrhax/Leksis/<TAG>/install.sh)`}</CodeBlock>
        <Callout>
          Replace <Code>&lt;TAG&gt;</Code> with the latest stable release tag (e.g. <Code>v1.8.0</Code>) — see the{' '}
          <a href="https://github.com/Mandrhax/Leksis/releases" target="_blank" rel="noreferrer" className="underline">GitHub Releases</a> page.
          Use <Code>bash &lt;(curl …)</Code>, <strong>not</strong> <Code>curl … | bash</Code> — the installer is interactive and reads
          from the terminal.
        </Callout>
        <Sub>What happens</Sub>
        <P>
          The installer has a TUI built on <Code>gum</Code> (auto-downloaded, checksum-verified) with an automatic plain-text
          fallback (no TTY, <Code>--no-tui</Code>, <Code>TERM=dumb</Code>, <Code>--yes</Code>, unsupported architecture, or
          download failure). It never depends on <Code>gum</Code> being present to function.
        </P>
        <P>The <Code>install</Code> command runs system checks (OS/RAM/CPU), then five configuration steps:</P>
        <List items={[
          <>Install paths and repository source.</>,
          <>Access mode — plain HTTP, HTTPS with a domain (automatic Let’s Encrypt), or behind an existing reverse proxy (NPM, Traefik…).</>,
          <>Admin account (email, name).</>,
          <>AI engine — local Ollama container, remote Ollama server, or an OpenAI-compatible API; GPU vendor detection for the local case.</>,
          <>Model selection (translation/OCR/rewrite) and PostgreSQL password.</>,
        ]} />
        <P>
          A summary screen is shown for confirmation <em>before</em> any heavy operation runs. Answers are saved to{' '}
          <Code>/etc/leksis/install.answers</Code> (chmod 600) before that point, so if a GPU driver install requires a
          reboot, re-running the installer offers to resume exactly where it left off. Heavy operations that follow:
          Docker install, GPU drivers, repository clone, <Code>.env</Code> generation, <Code>docker compose up -d --build</Code>,
          health-check wait, model pulls, admin account creation, and an HTTP reachability test.
        </P>
        <Sub>Non-interactive installs</Sub>
        <P>
          Every question has a stable answer key (<Code>LEKSIS_&lt;KEY&gt;</Code>), settable as an environment variable or in an
          answers file:
        </P>
        <CodeBlock>{`sudo ./install.sh --yes --answers answers.env install`}</CodeBlock>
        <P>
          Answer keys include <Code>INSTALL_DIR</Code>, <Code>REPO_URL</Code>, <Code>APP_HOST</Code>, <Code>ADMIN_EMAIL</Code>,{' '}
          <Code>ADMIN_NAME</Code>, <Code>AI_MODE</Code>, <Code>AI_URL</Code>, <Code>AI_API_KEY</Code>, <Code>GPU_VENDOR</Code>,{' '}
          <Code>SAME_MODEL_FOR_ALL</Code>, <Code>AI_MODEL</Code>, <Code>AI_OCR_MODEL</Code>, <Code>AI_REWRITE_MODEL</Code>,{' '}
          <Code>OLLAMA_MAX_LOADED_MODELS</Code>, <Code>POSTGRES_PASSWORD</Code>, <Code>PULL_REMOTE_MODELS</Code>,{' '}
          <Code>UPDATE_COMPONENTS</Code> — the full list is in <Code>install.sh --help</Code>. Destructive operations
          (uninstall, restore) still require a typed confirmation even with <Code>--yes</Code> (
          <Code>LEKSIS_CONFIRM_DELETE=DELETE</Code>, <Code>LEKSIS_CONFIRM_RESTORE=RESTORE</Code>).
        </P>
        <Sub>What gets created</Sub>
        <List items={[
          <><Code>.env</Code> in the install directory (chmod 600) — secrets and configuration; an existing <Code>.env</Code> is never overwritten blindly, its secrets are preserved.</>,
          <><Code>/etc/leksis/install.conf</Code> — records the install location for later commands.</>,
          <><Code>/usr/local/bin/leksis</Code> — a small launcher script (not a symlink) so the <Code>leksis</Code> command works from anywhere.</>,
          <>Install log at <Code>/var/log/leksis-install.log</Code>.</>,
        ]} />
      </>
    ),
  },
  {
    id: 'env-vars',
    title: 'Environment variables',
    icon: 'tune',
    body: (
      <>
        <P>
          Set in <Code>.env</Code> at the root of the install directory (see <Code>.env.production.example</Code> for the
          canonical, commented reference). <Code>install.sh</Code> generates this file for you; it can also be edited by
          hand and picked up on the next <Code>docker compose up -d</Code>.
        </P>
        <Callout tone="warning">
          Several values below (AI provider, model names, allow-external toggle) can be overridden at runtime from
          Admin → Services once saved to the database — the database value then takes precedence over <Code>.env</Code>{' '}
          until it is cleared. See <Code>Site settings reference</Code>.
        </Callout>
        <Sub>PostgreSQL</Sub>
        <Table
          headers={['Variable', 'Default', 'Purpose']}
          rows={[
            [<Code>POSTGRES_PASSWORD</Code>, '—', 'Password for the leksis_user account; also folded into DATABASE_URL.'],
            [<Code>POSTGRES_VERSION</Code>, '18', 'Major PostgreSQL version. Changing it on an existing install needs pg_upgrade or a dump/restore.'],
            [<Code>DATABASE_URL</Code>, 'postgresql://leksis_user:…@postgres:5432/leksis', 'Full connection string, internal Docker network hostname.'],
          ]}
        />
        <Sub>NextAuth / session security</Sub>
        <Table
          headers={['Variable', 'Default', 'Purpose']}
          rows={[
            [<Code>AUTH_SECRET</Code>, '—', 'Signs session JWTs. Generate with openssl rand -base64 32.'],
            [<Code>NEXTAUTH_URL</Code>, 'empty (recommended)', 'Leave empty: the public URL is detected from request headers, which works for HTTP, HTTPS and behind a proxy. Set only to pin one fixed address.'],
            [<Code>ENCRYPTION_KEY</Code>, '—', '64 hex chars (32 bytes), AES-256-GCM. Generate with openssl rand -hex 32. Encrypts the AI API key and SMTP password at rest.'],
          ]}
        />
        <Sub>Reverse proxy (Caddy)</Sub>
        <Table
          headers={['Variable', 'Default', 'Purpose']}
          rows={[
            [<Code>CADDY_HOST</Code>, ':80', ':80 for HTTP or behind a reverse proxy; a domain name for automatic HTTPS. Overridden by the caddy_config admin setting once saved.'],
          ]}
        />
        <Sub>AI engine</Sub>
        <Table
          headers={['Variable', 'Default', 'Purpose']}
          rows={[
            [<Code>AI_PROVIDER</Code>, 'ollama', '"ollama" or "openai" (any OpenAI-compatible API).'],
            [<Code>AI_BASE_URL</Code>, 'http://ollama:11434', 'Engine base URL. For a remote engine reachable via localhost/127.x, install.sh rewrites it to host.docker.internal.'],
            [<Code>AI_API_KEY</Code>, 'empty', 'Bearer token for OpenAI-compatible APIs; stored in clear in .env (chmod 600). A key saved from the admin panel is encrypted in the database and takes precedence.'],
            [<Code>AI_MODEL</Code>, '—', 'Translation model id.'],
            [<Code>AI_OCR_MODEL</Code>, '—', 'Vision-capable model id used for OCR.'],
            [<Code>AI_REWRITE_MODEL</Code>, '—', 'Rewrite model id.'],
            [<Code>COMPOSE_PROFILES</Code>, 'ollama', 'Set to "ollama" to run the local Ollama container; leave empty for a remote engine (Ollama or OpenAI-compatible). This is the source of truth for "local vs remote".'],
          ]}
        />
        <Sub>Ollama runtime (local container only)</Sub>
        <Table
          headers={['Variable', 'Default', 'Purpose']}
          rows={[
            [<Code>OLLAMA_KEEP_ALIVE</Code>, '-1', 'How long to keep a model loaded in VRAM after use (-1 = forever, 5m = 5 minutes, 0 = unload immediately).'],
            [<Code>OLLAMA_SCHED_SPREAD</Code>, 'true', 'Spread model layers across multiple GPUs.'],
            [<Code>OLLAMA_MAX_LOADED_MODELS</Code>, '3', 'Maximum number of models kept loaded simultaneously.'],
            [<Code>OLLAMA_IMAGE</Code>, 'ollama/ollama:latest', 'Overridden automatically when a GPU-specific compose overlay is selected.'],
          ]}
        />
        <Callout>
          Renamed in v1.5.1: the app-level <Code>OLLAMA_MODEL</Code> / <Code>OLLAMA_OCR_MODEL</Code> / <Code>OLLAMA_REWRITE_MODEL</Code>{' '}
          / <Code>OLLAMA_BASE_URL</Code> became <Code>AI_MODEL</Code> / <Code>AI_OCR_MODEL</Code> / <Code>AI_REWRITE_MODEL</Code> /{' '}
          <Code>AI_BASE_URL</Code> (the engine is not always Ollama). <Code>leksis update</Code> renames them in an existing{' '}
          <Code>.env</Code> automatically; the old names are still read as a fallback if present. The Ollama container’s own
          runtime variables (<Code>OLLAMA_KEEP_ALIVE</Code>, <Code>OLLAMA_SCHED_SPREAD</Code>, <Code>OLLAMA_MAX_LOADED_MODELS</Code>,{' '}
          <Code>OLLAMA_IMAGE</Code>) were never renamed — they are real Ollama container settings, not app config.
        </Callout>
      </>
    ),
  },
  {
    id: 'settings-reference',
    title: 'Site settings reference',
    icon: 'settings_applications',
    body: (
      <>
        <P>
          Runtime configuration beyond <Code>.env</Code> lives in a single <Code>site_settings</Code> table (JSONB per key),
          edited from the admin panel. Most keys are covered by the JSON export/import on the Backup page; a few
          infrastructure keys are deliberately excluded (see notes).
        </P>
        <Table
          headers={['Key', 'Controls', 'Edited from', 'Export/import']}
          rows={[
            [<Code>branding</Code>, 'Site name, colors, logo, header logo size', 'Settings → Identity', 'Yes'],
            [<Code>design</Code>, 'Button radius, footer text/links', 'Settings → Appearance', 'Yes'],
            [<Code>general</Code>, 'Contact email, global banner, maintenance mode, log retention (days)', 'Settings → General', 'Yes'],
            [<Code>legal</Code>, 'Organization name, contact, free-text privacy/usage notes (single language, not auto-translated)', 'Settings → Legal', 'Yes'],
            [<Code>features</Code>, 'Which tabs are enabled, default source/target language and formality, size/rate limits', 'Settings → Features & limits', 'Yes'],
            [<Code>rewrite_tones</Code>, '1–6 rewrite tones, each with EN/FR/DE/IT labels and a prompt instruction', 'Settings → AI tones', 'Yes'],
            [<Code>auth_config</Code>, 'Active sign-in method (see Authentication)', 'Settings → Connection', 'Yes'],
            [<Code>oidc_config</Code>, 'OIDC issuer, client id, encrypted client secret, button label, scopes', 'Settings → Connection', <>No — secret only</>],
            [<Code>ai_config</Code>, 'AI provider, base URL, encrypted API key, models, allow-external toggle, num_ctx, concurrency limit', 'Services → AI', <>Partial — no API key, no allow-external flag</>],
            [<Code>caddy_config</Code>, 'Access mode (http/https/proxy), domain, trusted proxies', 'Services → Caddy', 'No'],
            [<Code>smtp_config</Code>, 'SMTP relay for OTP emails, encrypted password', 'Settings → General', 'No'],
            [<Code>system_status</Code>, 'Last backup timestamp', 'Written only by install.sh', 'No'],
          ]}
        />
        <Callout>
          Unknown keys are stripped on save (zod schemas in <Code>src/lib/settings-schema.ts</Code>). Secrets (AI API key,
          SMTP password, OIDC client secret) are AES-256-GCM encrypted at rest using <Code>ENCRYPTION_KEY</Code>, never
          returned to the browser, never exported, never written to the audit log.
        </Callout>
      </>
    ),
  },
  {
    id: 'auth',
    title: 'Authentication & access',
    icon: 'shield_person',
    body: (
      <>
        <P>
          Accounts are created on first successful sign-in — there is no separate “invite” step. <strong>Deleting</strong>{' '}
          an account therefore does not stop the person from coming back; the real block is <strong>disabling</strong> the
          account (Admin → Users).
        </P>
        <Sub>Sign-in methods (one active at a time, Settings → Connection)</Sub>
        <Table
          headers={['Method', 'Behavior']}
          rows={[
            [<Code>otp_display</Code>, 'One-time code shown directly on screen. No email infrastructure needed — the default, suited to demos and simple deployments.'],
            [<Code>otp_email</Code>, 'One-time code sent by email via the configured SMTP relay. If the send fails, sign-in is refused (503) rather than silently falling back to on-screen display.'],
            [<Code>password_admin_approval</Code>, 'Password-based; new accounts must be approved by an admin before they can sign in.'],
            [<Code>password_email_verify</Code>, 'Password-based; new accounts verify ownership of their email via a link before first sign-in.'],
            [<Code>sso_oidc</Code>, 'Single sign-on via any standard OIDC provider (issuer, client id/secret, scopes configured in Settings → Connection). Discovery is verified against /.well-known/openid-configuration.'],
          ]}
        />
        <Sub>Session mechanics</Sub>
        <List items={[
          <>JWT sessions, 30-day lifetime, no database adapter (no accounts/sessions/verification_token tables).</>,
          <>The role is embedded in the JWT but re-read from the database on every session check (short cache) — a disabled or deleted account, or a role change, takes effect immediately rather than at token expiry.</>,
          <>If the database is unreachable at that moment, the role from the token is used as a fallback.</>,
        ]} />
        <Sub>Public URL detection</Sub>
        <P>
          With <Code>NEXTAUTH_URL</Code> left empty (the default), the public origin is detected from the reverse proxy’s{' '}
          <Code>X-Forwarded-*</Code> headers on every request — this is what makes the same image work unmodified behind
          HTTP, HTTPS, or an external reverse proxy. Caddy is configured to trust the private network ranges plus any
          additional trusted proxies configured in Services → Caddy.
        </P>
      </>
    ),
  },
  {
    id: 'ai-engine',
    title: 'AI engine setup',
    icon: 'smart_toy',
    body: (
      <>
        <P>
          Exactly one provider serves all three AI functions (translation, OCR, rewrite) — selected in Admin → Services → AI,
          or at install time.
        </P>
        <Table
          headers={['Provider', 'API', 'Typical use']}
          rows={[
            ['ollama', '/api/generate (NDJSON)', 'Local container (Docker Compose profile "ollama") or a remote Ollama server.'],
            ['openai', '/v1/chat/completions (SSE) + /v1/models', 'vLLM, LM Studio, llama.cpp, OpenRouter, OpenAI itself… any OpenAI-compatible endpoint, optional bearer API key.'],
          ]}
        />
        <Sub>Capability matrix</Sub>
        <P>
          Not every capability is available on every provider — the admin UI hides controls the active provider does not
          support, and the corresponding API routes return 400 if called anyway:
        </P>
        <List items={[
          <><strong>pull / delete / warm up into VRAM / unload / list running models</strong> — Ollama only.</>,
          <><strong>Voice dictation (transcribe)</strong> — OpenAI-compatible providers only. Ollama has no audio input in its native API; the model is dedicated to this via a separate <Code>voiceModel</Code> setting, independent from the “same model for all” toggle. An empty <Code>voiceModel</Code> hides the microphone button entirely.</>,
        ]} />
        <Sub>External servers are blocked by default</Sub>
        <P>
          Until an admin explicitly ticks “Allow servers outside the private network” (Services → AI), any AI engine URL
          resolving outside the private network (RFC1918, loopback, link-local, CGNAT, <Code>.local</Code>/<Code>.lan</Code>/
          <Code>.internal</Code>, or a bare hostname without a dot) is rejected — both when saving the URL and on every
          request (403 <Code>external_blocked</Code>). Public hostnames are resolved via DNS to make this decision (fail
          closed on a lookup failure). This is the gate that determines whether user text can leave the private network.
        </P>
        <Sub>Local vs. remote Ollama</Sub>
        <P>
          The local container is an optional Docker Compose <Code>profiles: [&quot;ollama&quot;]</Code> service — enabled by{' '}
          <Code>COMPOSE_PROFILES=ollama</Code> in <Code>.env</Code>, which is also the single source of truth the admin
          panel reads to tell local and remote apart. The local URL (<Code>http://ollama:11434</Code>) is locked in the
          admin UI and cannot be edited from there; switching to/from local is done with <Code>leksis config</Code>, which
          also recreates the app container as needed.
        </P>
        <Sub>Concurrency and context size</Sub>
        <P>
          <Code>ai_config.maxConcurrentAiRequests</Code> (Services → AI, 0 = unlimited) makes excess requests wait for a
          free slot instead of overloading the engine. <Code>ai_config.numCtx</Code> (default 8192) sets the context window
          used for ordinary requests; loading a model permanently into VRAM (“Load into VRAM”) instead sends{' '}
          <Code>keep_alive: -1</Code>.
        </P>
      </>
    ),
  },
  {
    id: 'docker',
    title: 'Docker & services',
    icon: 'dns',
    body: (
      <>
        <Table
          headers={['Container', 'Image', 'Purpose', 'Notes']}
          rows={[
            ['leksis-app', 'built from Dockerfile (node:22-slim)', 'Next.js app — UI + API', 'no-new-privileges, all Linux capabilities dropped; unprivileged Node process on port 3000 internally.'],
            ['leksis-postgres', 'postgres:${POSTGRES_VERSION}-alpine', 'Primary database', 'PGDATA fixed at /var/lib/postgresql/data — never point it at a subdirectory, that triggers a silent re-init and data loss.'],
            ['leksis-caddy', 'caddy:2-alpine', 'Reverse proxy, TLS termination', 'Only container with host ports (80, 443).'],
            ['leksis-ollama', 'ollama/ollama:latest (or a GPU-specific tag)', 'Local LLM inference', 'Optional — Compose profile "ollama". No host port exposed (11434 is internal-network only).'],
          ]}
        />
        <Sub>Volumes</Sub>
        <List items={[
          <><Code>postgres_data</Code> — database files, survives restarts and updates.</>,
          <><Code>ollama_data</Code> — downloaded model weights (local engine only).</>,
          <><Code>leksis_uploads</Code> — logo and background image uploads.</>,
          <><Code>caddy_data</Code> — Caddy’s TLS state (certificates, its own autosave.json).</>,
        ]} />
        <Sub>GPU overlays (local Ollama only)</Sub>
        <P>
          <Code>docker-compose.nvidia.yml</Code> and <Code>docker-compose.amd.yml</Code> are selected automatically by{' '}
          <Code>install.sh</Code> based on detected hardware. They are Compose <em>overlays</em>, layered on top of the base
          file — never a replacement for it:
        </P>
        <CodeBlock>{`docker compose -f docker-compose.yml -f docker-compose.nvidia.yml up -d`}</CodeBlock>
        <P>
          NVIDIA: a pinned, checksum-verified <Code>.run</Code> driver + DKMS, plus the NVIDIA Container Toolkit. AMD: ROCm
          via the <Code>amdgpu-install</Code> <Code>.deb</Code> package. Both are apt-only installation paths.
        </P>
        <Sub>Compose project & networking</Sub>
        <P>
          New installs set <Code>COMPOSE_PROJECT_NAME=leksis</Code> (volumes are named <Code>leksis_*</Code>). All
          containers share a single bridge network (<Code>leksis-net</Code>); only Caddy publishes host ports. The app has{' '}
          <Code>extra_hosts: host.docker.internal:host-gateway</Code> so it can reach an AI engine running on the Docker
          host itself.
        </P>
      </>
    ),
  },
  {
    id: 'access',
    title: 'Reverse proxy & access modes',
    icon: 'router',
    body: (
      <>
        <P>
          A single concept — the <strong>access mode</strong> — governs how the instance is reached, configured in
          Admin → Services → Caddy or with <Code>leksis config</Code>:
        </P>
        <Table
          headers={['Mode', 'Behavior']}
          rows={[
            ['http', 'Plain HTTP on port 80, reached by IP address. No certificate.'],
            ['https', 'A domain name pointed at this server; Caddy requests and renews a Let’s Encrypt certificate automatically. Ports 80 and 443 must be reachable from the internet. An optional HTTP fallback can stay enabled.'],
            ['proxy', 'The instance sits behind an existing reverse proxy (Nginx Proxy Manager, Traefik…) that terminates TLS itself and forwards plain HTTP to Leksis’ Caddy on port 80.'],
          ]}
        />
        <P>
          In every mode, Caddy declares <Code>trusted_proxies static private_ranges</Code> (plus any additional trusted
          proxies configured for the “proxy” mode), so <Code>X-Forwarded-*</Code> headers are only trusted when they
          actually come from a trusted hop.
        </P>
        <Sub>Changing access mode</Sub>
        <P>
          Saving from Admin → Services → Caddy updates <Code>caddy_config</Code> in the database and reloads Caddy live via
          its local admin API (<Code>POST http://caddy:2019/load</Code>) — no container restart. <Code>leksis config</Code>{' '}
          does the same from the CLI and keeps <Code>CADDY_HOST</Code> in <Code>.env</Code> roughly in sync for display
          purposes, but the database value is what actually governs behavior once it has been saved once.
        </P>
      </>
    ),
  },
  {
    id: 'cli',
    title: 'CLI reference (leksis / install.sh)',
    icon: 'terminal',
    body: (
      <>
        <P>
          After installation, the <Code>leksis</Code> launcher (<Code>/usr/local/bin/leksis</Code>) wraps{' '}
          <Code>install.sh</Code> and locates the install directory automatically. Run without arguments for an
          interactive menu.
        </P>
        <Table
          headers={['Command', 'Description']}
          rows={[
            ['install', 'First-time installation (see Installation above).'],
            ['update', 'Fetches tags, offers a version switch, lets you pick which components to update (app/caddy/postgres/ollama/models), takes a full backup first, then rebuilds/pulls. Rolls back automatically if the app fails its health check after a version change.'],
            ['backup', 'Creates a timestamped backup archive (see Backup & restore below). Rotates old backups (default: keep 7).'],
            ['restore [file]', 'Restores from a backup archive. Requires typed confirmation (RESTORE), takes a safety backup first, stops the app, drops and reloads the schema.'],
            ['uninstall', 'Shows volume disk usage, offers an optional backup (copied outside the install directory first), asks whether to keep volumes, requires typed confirmation (DELETE), then removes containers/images/folder.'],
            ['status', 'Installed version, access URL + HTTP test, container status, AI engine mode and reachability, configured models present or missing, volumes, backups, last app logs.'],
            ['config', 'Edit AI models, local Ollama runtime settings or remote URL, PostgreSQL version, and switch access mode — without a full re-install.'],
            ['logs [service]', 'Follows docker compose logs for app / postgres / caddy (+ ollama if running locally).'],
          ]}
        />
        <Callout tone="warning">
          <Code>update</Code> is tag-only: it always does <Code>git fetch --tags</Code> + <Code>git checkout &lt;latest tag&gt;</Code>,
          never a branch. A stable install only ever sees stable tags; it will not accidentally pick up a beta.
        </Callout>
      </>
    ),
  },
  {
    id: 'backup',
    title: 'Backup, restore & updates',
    icon: 'cloud_download',
    body: (
      <>
        <P>Two distinct, deliberately separate backup mechanisms:</P>
        <Table
          headers={['Mechanism', 'Contains', 'Restorable with']}
          rows={[
            [<Code>leksis backup</Code>, 'Full pg_dump, uploaded logo/background files, .env, version — everything needed to fully reconstruct the instance including secrets.', <Code>leksis restore</Code>],
            ['Admin → Backup (JSON export)', 'site_settings (no secrets), glossaries, logo/background as base64. Never users, audit log or usage log.', 'Admin → Backup import (validated per-key, unknown keys skipped)'],
          ]}
        />
        <P>
          The two are not merged on purpose: putting the PostgreSQL password, <Code>AUTH_SECRET</Code> and{' '}
          <Code>ENCRYPTION_KEY</Code> into a file downloadable from the browser would widen the attack surface
          considerably.
        </P>
        <Sub>Update behavior</Sub>
        <List items={[
          <>Always backs up before touching anything.</>,
          <>Image-based services (caddy, postgres, ollama) are pulled; the app is rebuilt from source (<Code>--build</Code> does not pull remote images).</>,
          <>There is a short window, during a schema-changing update, where the app has restarted on new code before the corresponding database migration has applied — expected and documented per release.</>,
          <>If the app fails its health check after a version switch, a rollback (previous commit + rebuild) is offered.</>,
        ]} />
        <Sub>Release channels</Sub>
        <P>
          Stable installs (<Code>vX.Y.Z</Code> tags) never see pre-release tags. An install that started from a beta tag
          (<Code>vX.Y.Z-beta.N</Code>) keeps following betas, then the next stable release once it is published. Channel
          is inferred from the currently checked-out tag — there is no separate “channel” setting to misconfigure.
        </P>
      </>
    ),
  },
  {
    id: 'security',
    title: 'Security model',
    icon: 'security',
    body: (
      <>
        <List items={[
          <><strong>Strict client/server separation</strong> — no AI logic or secret ever ships to the browser.</>,
          <><strong>Route guards</strong> — every user-facing API route requires an authenticated session and enforces a per-user rate limit (0 = unlimited, configurable in Settings → Features & limits); every admin route requires the admin role. A reverse-proxy-level filter for anonymous requests is defense in depth on top of this, not a replacement for it.</>,
          <><strong>Input validation</strong> — size and type limits enforced before the request body is even read (protects against oversized uploads), plus zod schemas on every structured input; Caddy also caps body size (50 MB).</>,
          <><strong>Secrets at rest</strong> — AI API key, SMTP password and OIDC client secret are AES-256-GCM encrypted with <Code>ENCRYPTION_KEY</Code>, never returned to the client, never exported, never logged.</>,
          <><strong>Upload validation</strong> — logo/background images are checked by magic bytes (not just extension) and size; SVG is rejected outright (it is executable code); served with a sandboxed Content-Security-Policy and <Code>nosniff</Code>.</>,
          <><strong>Security headers</strong> (production only) — CSP with <Code>frame-ancestors &apos;none&apos;</Code> and <Code>object-src &apos;none&apos;</Code>, X-Frame-Options, Referrer-Policy, Permissions-Policy. HSTS is intentionally not set at the app level — add it in Caddy if running HTTPS mode.</>,
          <><strong>Container hardening</strong> — the app container runs with <Code>no-new-privileges</Code> and all Linux capabilities dropped (postgres/caddy/ollama are excluded — their entrypoints need to switch users or bind low ports).</>,
          <><strong>Audit log</strong> — every admin action is recorded fire-and-forget; manual and automatic log purges are themselves recorded, after the deletion completes.</>,
          <><strong>External AI engines blocked by default</strong> — see AI engine setup above; this is the boundary that decides whether user-submitted text can leave the private network.</>,
        ]} />
      </>
    ),
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting & operational notes',
    icon: 'build',
    body: (
      <>
        <List items={[
          <><strong>Where to look first</strong> — <Code>leksis status</Code> for a full health snapshot, <Code>leksis logs [service]</Code> to tail logs, or <Code>/var/log/leksis-install.log</Code> for install-time output.</>,
          <><strong>App can’t reach the AI engine</strong> — check Services → AI → Monitoring for reachability and model presence; for a remote engine, verify it’s actually on the private network or that “Allow servers outside the private network” is intentionally enabled.</>,
          <><strong>OCR or voice dictation not working with a given model</strong> — the app never verifies that the configured OCR/voice model actually supports images/audio; this must be validated per model/server. Not every model server accepts the same audio container format the browser recorded (webm/opus, mp4…) — that is never transcoded.</>,
          <><strong>“Pinned URL” notice in the admin dashboard</strong> — a leftover <Code>NEXTAUTH_URL</Code> value from before automatic detection was introduced; safe to clear via <Code>leksis update</Code>’s automatic migration, or manually.</>,
          <><strong>GPU not detected / driver install fails</strong> — only apt-based systems are supported for automatic driver installation; on unsupported distributions, install NVIDIA/ROCm drivers manually first, then re-run <Code>leksis config</Code> to pick up the hardware.</>,
          <><strong>Restoring on a machine with a different ENCRYPTION_KEY</strong> — <Code>leksis restore</Code> adopts the key from the backup automatically; this is required to decrypt credentials stored in the database.</>,
        ]} />
      </>
    ),
  },
]

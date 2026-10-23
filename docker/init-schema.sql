-- ============================================================
-- Leksis — Docker DB Schema Initialization
-- Executed automatically by the postgres container on first start
-- (when the postgres_data volume is empty)
-- ============================================================

-- UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- users — accounts are created on first sign-in (OTP) or by the install script
-- ============================================================
-- status: onboarding state for the currently active auth method ('active' = no pending step — OTP/OIDC
-- accounts never leave it). Orthogonal to `disabled` (admin-blocked vs never-finished-signup).
-- password_hash: set only for accounts created/attached through a password-based method.
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name          TEXT,
  email         TEXT UNIQUE NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user',
  disabled      BOOLEAN NOT NULL DEFAULT FALSE,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending_approval', 'pending_verification')),
  password_hash TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- otp_tokens — short-lived OTP codes (10 min TTL)
-- ============================================================
CREATE TABLE IF NOT EXISTS otp_tokens (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  email      TEXT NOT NULL,
  token      TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used       BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS otp_tokens_email_idx ON otp_tokens(email);

-- ============================================================
-- email_tokens — single-use, purpose-tagged tokens for email flows (starts with email verification;
-- reusable later for password reset without a new migration). 24h TTL, see src/lib/accounts.ts.
-- ============================================================
CREATE TABLE IF NOT EXISTS email_tokens (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  email      TEXT NOT NULL,
  token      TEXT NOT NULL,
  purpose    TEXT NOT NULL DEFAULT 'verify_email',
  expires_at TIMESTAMPTZ NOT NULL,
  used       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS email_tokens_token_idx ON email_tokens(token);
CREATE INDEX IF NOT EXISTS email_tokens_email_idx ON email_tokens(email);

-- ============================================================
-- site_settings — key/value store for admin configuration
-- Used by src/lib/settings.ts (getSetting / updateSetting)
-- ============================================================
CREATE TABLE IF NOT EXISTS site_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT
);

-- ============================================================
-- audit_log — admin action journal
-- Used by src/lib/audit.ts (logAudit)
-- Columns: user_id, user_email, action, resource, detail
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id    TEXT,
  user_email TEXT,
  action     TEXT NOT NULL,
  resource   TEXT,
  detail     JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON audit_log(created_at DESC);

-- ============================================================
-- usage_log — AI call tracking
-- Used by src/lib/usage.ts (logUsage)
-- Columns: user_id, user_email, feature, source_lang, target_lang, model, char_count,
--          trigger_type, status, model_chars, latency_ms, request_group_id (migration 006)
-- ============================================================
CREATE TABLE IF NOT EXISTS usage_log (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id     TEXT,
  user_email  TEXT NOT NULL,
  feature     TEXT NOT NULL,
  source_lang TEXT,
  target_lang TEXT,
  model       TEXT,
  char_count  INTEGER,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  trigger_type     TEXT,
  status           TEXT,
  model_chars      INTEGER,
  latency_ms       INTEGER,
  request_group_id TEXT
);
CREATE INDEX IF NOT EXISTS usage_log_created_at_idx ON usage_log(created_at DESC);

-- ============================================================
-- glossaries — named shared glossaries managed by admin
-- ============================================================
CREATE TABLE IF NOT EXISTS glossaries (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- glossary_entries — terms within each glossary
-- source_lang / target_lang : BCP47 code or NULL = any language
-- ============================================================
CREATE TABLE IF NOT EXISTS glossary_entries (
  id           SERIAL PRIMARY KEY,
  glossary_id  INTEGER NOT NULL REFERENCES glossaries(id) ON DELETE CASCADE,
  source_term  TEXT NOT NULL,
  target_term  TEXT NOT NULL,
  source_lang  VARCHAR(20),
  target_lang  VARCHAR(20),
  match_variants BOOLEAN NOT NULL DEFAULT FALSE,  -- also match word-ending variants (plurals…)
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS glossary_entries_glossary_id_idx ON glossary_entries(glossary_id);

-- ============================================================
-- user_glossary_prefs — per-user per-glossary opt-out
-- Convention: a row only exists when enabled = FALSE
-- Absence of row = glossary is enabled for that user (default)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_glossary_prefs (
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  glossary_id  INTEGER NOT NULL REFERENCES glossaries(id) ON DELETE CASCADE,
  enabled      BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (user_id, glossary_id)
);

-- ============================================================
-- feedback — "Report a problem or suggest an improvement" messages, read by administrators (Admin → Feedback)
-- user_email is kept as written: a deleted account leaves its messages behind (user_id becomes NULL).
-- context: optional details the user chose to attach (active tab, interface language, app version, browser).
-- ============================================================
CREATE TABLE IF NOT EXISTS feedback (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  user_email  TEXT NOT NULL,
  category    TEXT NOT NULL CHECK (category IN ('problem', 'improvement', 'translation', 'other')),
  message     TEXT NOT NULL,
  context     JSONB,
  status      TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'done', 'archived')),
  admin_note  TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS feedback_created_at_idx ON feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_status_idx ON feedback(status);

-- feedback_attachments — images attached to a message (PNG / JPEG / WebP, checked by magic bytes). Stored in the
-- database rather than in the uploads volume: only administrators may read them, and they go with pg_dump backups.
CREATE TABLE IF NOT EXISTS feedback_attachments (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  feedback_id TEXT NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL DEFAULT 0,
  mime        TEXT NOT NULL,
  size        INTEGER NOT NULL,
  data        BYTEA NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS feedback_attachments_feedback_id_idx ON feedback_attachments(feedback_id);

-- ============================================================
-- To add the first admin user after deployment, use the
-- install.sh script, or run manually:
--
--   docker compose exec postgres psql -U leksis_user -d leksis \
--     -c "INSERT INTO users (email, name, role) VALUES ('admin@example.com', 'Admin', 'admin');"
-- ============================================================

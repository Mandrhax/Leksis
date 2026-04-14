-- ============================================================
-- Leksis — Docker DB Schema Initialization
-- Executed automatically by the postgres container on first start
-- (when the postgres_data volume is empty)
-- ============================================================

-- UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- users — compatible with @auth/pg-adapter
-- Pre-registered by admin via INSERT or the install script
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name            TEXT,
  email           TEXT UNIQUE NOT NULL,
  "emailVerified" TIMESTAMPTZ,
  image           TEXT,
  role            TEXT NOT NULL DEFAULT 'user',
  created_at      TIMESTAMPTZ DEFAULT NOW()
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
-- NextAuth tables (@auth/pg-adapter)
-- ============================================================
CREATE TABLE IF NOT EXISTS accounts (
  id                   TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId"             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider             TEXT NOT NULL,
  type                 TEXT NOT NULL,
  "providerAccountId"  TEXT NOT NULL,
  access_token         TEXT,
  expires_at           BIGINT,
  refresh_token        TEXT,
  id_token             TEXT,
  scope                TEXT,
  session_state        TEXT,
  token_type           TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "sessionToken" TEXT UNIQUE NOT NULL,
  "userId"       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires        TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS verification_token (
  identifier TEXT NOT NULL,
  token      TEXT NOT NULL,
  expires    TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (identifier, token)
);

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
-- Columns: user_id, user_email, feature, source_lang, target_lang, model, char_count
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
  created_at  TIMESTAMPTZ DEFAULT NOW()
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
-- To add the first admin user after deployment, use the
-- install.sh script, or run manually:
--
--   docker compose exec postgres psql -U leksis_user -d leksis \
--     -c "INSERT INTO users (email, name, role) VALUES ('admin@example.com', 'Admin', 'admin');"
-- ============================================================

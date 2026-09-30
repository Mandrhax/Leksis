-- ============================================================
-- Leksis 1.8.0 — configurable authentication methods.
-- Applied by `leksis update` (install.sh migrate_db). Idempotent: safe to run any number of times.
--
--   * users.status: onboarding state for the currently active auth method ('active' by default — OTP/OIDC
--     accounts have no onboarding step). Orthogonal to `disabled` (admin-blocked vs never-finished-signup).
--   * users.password_hash: set only for accounts created/attached through a password-based method.
--   * email_tokens: single-use, purpose-tagged tokens for email flows (starts with email verification;
--     reusable later for password reset without a new migration).
-- ============================================================
BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_status_check') THEN
    ALTER TABLE users ADD CONSTRAINT users_status_check
      CHECK (status IN ('active', 'pending_approval', 'pending_verification'));
  END IF;
END $$;

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

COMMIT;

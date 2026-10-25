-- ============================================================
-- Leksis 1.11.0 — sign-in hardening.
-- Applied by `leksis update` (install.sh migrate_db). Idempotent: safe to run any number of times.
--
--   * otp_tokens.attempts: wrong guesses on the current code; the code is invalidated after 5.
--     Codes are now stored as a SHA-256 hash: codes issued before this migration (plain text, 10 min TTL)
--     are invalidated — users simply request a new one.
--   * users.oidc_issuer / oidc_sub: an SSO account is bound to its identity provider subject on first sign-in,
--     then never matched by email again (an IdP whose email claim users can edit could otherwise take it over).
--
-- The code that reads these columns fails briefly between the app restart and the migration during `update`.
-- ============================================================
BEGIN;

ALTER TABLE otp_tokens ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0;
UPDATE otp_tokens SET used = TRUE WHERE used = FALSE AND token ~ '^[0-9]{6}$';

ALTER TABLE users ADD COLUMN IF NOT EXISTS oidc_issuer TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS oidc_sub    TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS users_oidc_identity_idx ON users (oidc_issuer, oidc_sub) WHERE oidc_sub IS NOT NULL;

COMMIT;

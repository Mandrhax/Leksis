-- ============================================================
-- Leksis 1.5.1 — user deactivation.
-- Applied by `leksis update` (install.sh migrate_db). Idempotent: safe to run any number of times.
--
--   * users.disabled: a disabled account can no longer sign in and its open sessions end at the next
--     session read. Accounts are created on first sign-in, so deleting a user does not keep them out —
--     disabling does.
-- ============================================================
BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMIT;

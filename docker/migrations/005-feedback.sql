-- ============================================================
-- Leksis 1.9.0 — "Report a problem or suggest an improvement": messages from users, read in Admin → Feedback.
-- Applied by `leksis update` (install.sh migrate_db). Idempotent and non-destructive: only creates new tables.
--
--   * feedback: one message (category, text, optional context, status, private admin note). user_email is kept
--     as written; deleting the account sets user_id to NULL and keeps the message.
--   * feedback_attachments: attached images (PNG / JPEG / WebP), deleted with their message.
--
-- The feedback button and inbox fail briefly between the app restart and the migration during `update`.
-- ============================================================
BEGIN;

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

COMMIT;

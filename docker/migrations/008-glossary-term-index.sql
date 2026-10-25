-- ============================================================
-- Leksis 1.11.0 — glossary term index.
-- Applied by `leksis update` (install.sh migrate_db). Idempotent: safe to run any number of times.
--
--   * (glossary_id, lower(source_term)): duplicate check on every added term and the admin list order
--     (ORDER BY lower(source_term)) no longer scan the whole glossary.
-- ============================================================
CREATE INDEX IF NOT EXISTS glossary_entries_term_idx ON glossary_entries (glossary_id, lower(source_term));

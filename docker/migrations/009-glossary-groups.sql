-- ============================================================
-- Leksis 1.12.0 — glossaries: optional group name.
-- Applied by `leksis update` (install.sh migrate_db). Idempotent: safe to run any number of times.
--
--   * glossaries.group_name: bundles several glossaries (e.g. one per language pair) under one name.
--     Users then see and toggle the whole group in Settings, instead of each individual glossary.
--     NULL (default) = ungrouped, shown as before.
-- ============================================================
BEGIN;

ALTER TABLE glossaries ADD COLUMN IF NOT EXISTS group_name VARCHAR(100);

COMMIT;

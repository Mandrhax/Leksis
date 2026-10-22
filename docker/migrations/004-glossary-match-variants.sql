-- ============================================================
-- Leksis 1.8.4 — glossary: optional matching of word-ending variants.
-- Applied by `leksis update` (install.sh migrate_db). Idempotent: safe to run any number of times.
--
--   * glossary_entries.match_variants: when TRUE, the term also matches the source text with a few extra letters
--     at the end of the word (plurals, conjugations: "contrat" → "contrats"). FALSE = whole word only.
--
-- The code that reads this column fails briefly between the app restart and the migration during `update`.
-- ============================================================
BEGIN;

ALTER TABLE glossary_entries ADD COLUMN IF NOT EXISTS match_variants BOOLEAN NOT NULL DEFAULT FALSE;

COMMIT;

-- ============================================================
-- Leksis 1.10.0 — usage_log records how each AI call ended, to measure the effect of the text-translation
-- optimisations (debounce, cancellation, cache, incremental paragraphs).
-- Applied by `leksis update` (install.sh migrate_db). Idempotent and non-destructive: only adds nullable columns,
-- existing rows are left as they are (NULL = written before this version).
--
--   * trigger_type: typing | paste | button | lang_change | auto_detect (text tab only)
--   * status: completed | cancelled | cache_hit | skipped | error
--   * model_chars: characters actually sent to the model (0 on a cache hit)
--   * latency_ms: request start → end of the response
--   * request_group_id: shared by the successive requests of one input session
-- ============================================================
BEGIN;

ALTER TABLE usage_log ADD COLUMN IF NOT EXISTS trigger_type     TEXT;
ALTER TABLE usage_log ADD COLUMN IF NOT EXISTS status           TEXT;
ALTER TABLE usage_log ADD COLUMN IF NOT EXISTS model_chars      INTEGER;
ALTER TABLE usage_log ADD COLUMN IF NOT EXISTS latency_ms       INTEGER;
ALTER TABLE usage_log ADD COLUMN IF NOT EXISTS request_group_id TEXT;

COMMIT;

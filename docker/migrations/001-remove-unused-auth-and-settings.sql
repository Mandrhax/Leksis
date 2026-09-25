-- ============================================================
-- Leksis 1.5.1 — one-time cleanup of database objects the application no longer uses.
-- Applied by `leksis update` (install.sh migrate_db). Idempotent: safe to run any number of times,
-- and never destructive when the data is not empty.
--
--   * NextAuth adapter tables (sessions, accounts, verification_token): sessions are JWT-only and the
--     adapter was removed. A table that still holds rows is kept.
--   * users."emailVerified" / users.image: adapter columns, never read. Dropped only when no row uses them.
--   * site_settings: `db_config` (the old, never-applied PostgreSQL form — it still holds an encrypted
--     password), `seo` (never read) and the legacy `ollama_config` once `ai_config` has taken over.
-- ============================================================
BEGIN;

DO $$
DECLARE
  t text;
  n bigint;
BEGIN
  FOREACH t IN ARRAY ARRAY['sessions', 'accounts', 'verification_token'] LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n;
      IF n = 0 THEN
        EXECUTE format('DROP TABLE public.%I', t);
        RAISE NOTICE 'dropped unused table %', t;
      ELSE
        RAISE NOTICE 'kept table % (% rows)', t, n;
      END IF;
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'emailVerified') THEN
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE "emailVerified" IS NOT NULL) THEN
      ALTER TABLE public.users DROP COLUMN "emailVerified";
      RAISE NOTICE 'dropped column users.emailVerified';
    ELSE
      RAISE NOTICE 'kept column users.emailVerified (in use)';
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'image') THEN
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE image IS NOT NULL) THEN
      ALTER TABLE public.users DROP COLUMN image;
      RAISE NOTICE 'dropped column users.image';
    ELSE
      RAISE NOTICE 'kept column users.image (in use)';
    END IF;
  END IF;
END
$$;

DELETE FROM site_settings WHERE key IN ('db_config', 'seo');

DELETE FROM site_settings
WHERE key = 'ollama_config'
  AND EXISTS (SELECT 1 FROM site_settings WHERE key = 'ai_config' AND value <> '{}'::jsonb);

COMMIT;

-- ============================================================
-- Leksis — Migration : Glossaires centralisés
-- À exécuter une seule fois en tant que leksis_user :
--   psql $DATABASE_URL -f scripts/migrate-glossary.sql
-- ============================================================

-- 1. Glossaires nommés
CREATE TABLE IF NOT EXISTS glossaries (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Entrées par glossaire
--    source_lang / target_lang : code BCP47 (ex: 'en', 'fr') ou NULL = toutes les langues
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

-- 3. Préférences utilisateur par glossaire
--    Convention : une ligne n'est insérée QUE lorsque enabled = FALSE
--    Absence de ligne → glossaire activé par défaut pour cet utilisateur
CREATE TABLE IF NOT EXISTS user_glossary_prefs (
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  glossary_id  INTEGER NOT NULL REFERENCES glossaries(id) ON DELETE CASCADE,
  enabled      BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (user_id, glossary_id)
);

-- ============================================================
-- Leksis — Migration : Panneau d'administration
-- À exécuter une seule fois en tant que leksis_user :
--   psql $DATABASE_URL -f scripts/migrate-admin.sql
-- ============================================================

-- 1. Colonne role sur users
ALTER TABLE users ADD COLUMN IF NOT EXISTS
  role TEXT DEFAULT 'user' NOT NULL CHECK (role IN ('user', 'admin'));

-- 2. Réglages du site (key-value JSON)
CREATE TABLE IF NOT EXISTS site_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT REFERENCES users(id)
);

-- Utilisateur admin par défaut
INSERT INTO users (email, name, role)
VALUES ('admin@leksis.ch', 'Administrateur', 'admin')
ON CONFLICT (email) DO UPDATE SET role = 'admin';

-- Valeurs par défaut des réglages
INSERT INTO site_settings (key, value) VALUES
  ('branding', '{"siteName":"Leksis","primaryColor":"#565e74","secondaryColor":"#506076","darkMode":false}'),
  ('design',   '{"buttonRadius":"0.75rem","headerLogoSize":"32","footerText":"© Leksis","footerLinks":[]}'),
  ('general',  '{"contactEmail":"","globalBanner":"","maintenanceMode":false,"maintenanceMessage":""}'),
  ('seo',      '{"title":"Leksis","description":""}'),
  ('features', '{"tabs":{"text":true,"document":true,"image":true,"rewrite":true},"defaults":{"sourceLang":"auto","targetLang":"en"},"limits":{"maxTextChars":5000,"maxDocChars":12000,"maxImageMB":10}}'),
  ('ollama_config', '{"baseUrl":"http://localhost:11434","translationModel":"translategemma:27b","ocrModel":"maternion/LightOnOCR-2:latest","rewriteModel":"translategemma:27b","sameModelForAll":false}'),
  ('db_config',     '{"host":"localhost","port":5432,"database":"leksis","user":"leksis_user","passwordEnc":""}')
ON CONFLICT (key) DO NOTHING;

-- Migration ollama_config : renommer "model" → "translationModel" si l'ancienne clé existe
UPDATE site_settings
SET value = jsonb_set(
              value - 'model',
              '{translationModel}',
              value->'model'
            )
WHERE key = 'ollama_config'
  AND value ? 'model'
  AND NOT (value ? 'translationModel');

-- Ajouter rewriteModel si absent (copie de translationModel)
UPDATE site_settings
SET value = jsonb_set(value, '{rewriteModel}', value->'translationModel')
WHERE key = 'ollama_config'
  AND value ? 'translationModel'
  AND NOT (value ? 'rewriteModel');

-- 3. Journal d'audit
CREATE TABLE IF NOT EXISTS audit_log (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id    TEXT REFERENCES users(id),
  user_email TEXT NOT NULL,
  action     TEXT NOT NULL,
  resource   TEXT NOT NULL,
  detail     JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON audit_log(created_at DESC);

-- 4. Journal d'utilisation IA
CREATE TABLE IF NOT EXISTS usage_log (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id     TEXT REFERENCES users(id),
  user_email  TEXT NOT NULL,
  feature     TEXT NOT NULL CHECK (feature IN ('text', 'document', 'image', 'rewrite')),
  source_lang TEXT,
  target_lang TEXT,
  model       TEXT,
  char_count  INT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS usage_log_created_at_idx ON usage_log(created_at DESC);
CREATE INDEX IF NOT EXISTS usage_log_feature_idx    ON usage_log(feature);

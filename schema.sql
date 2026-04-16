-- ============================================================
-- Leksis — Schéma PostgreSQL
-- À exécuter en tant que superuser (postgres) :
--   psql -h 192.168.40.225 -U postgres -f schema.sql
-- ============================================================

-- 1. Créer la base et l'utilisateur applicatif
CREATE DATABASE leksis;
CREATE USER leksis_user WITH ENCRYPTED PASSWORD 'change_me';
GRANT ALL PRIVILEGES ON DATABASE leksis TO leksis_user;

\c leksis

-- Donner les droits sur le schéma public
GRANT ALL ON SCHEMA public TO leksis_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO leksis_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO leksis_user;

-- 2. Extension UUID
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- Table users (compatible @auth/pg-adapter)
-- Les utilisateurs sont pré-enregistrés par l'admin via INSERT
-- ============================================================
CREATE TABLE users (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name            TEXT,
  email           TEXT UNIQUE NOT NULL,
  "emailVerified" TIMESTAMPTZ,
  image           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Table otp_tokens — codes OTP temporaires (TTL 10 min)
-- ============================================================
CREATE TABLE otp_tokens (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  email      TEXT NOT NULL,
  token      TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used       BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX otp_tokens_email_idx ON otp_tokens(email);

-- ============================================================
-- Tables NextAuth (@auth/pg-adapter) — pour extensibilité future
-- ============================================================
CREATE TABLE accounts (
  id                   TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId"             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider             TEXT NOT NULL,
  type                 TEXT NOT NULL,
  "providerAccountId"  TEXT NOT NULL,
  access_token         TEXT,
  expires_at           BIGINT,
  refresh_token        TEXT,
  id_token             TEXT,
  scope                TEXT,
  session_state        TEXT,
  token_type           TEXT
);

CREATE TABLE sessions (
  id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "sessionToken" TEXT UNIQUE NOT NULL,
  "userId"       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires        TIMESTAMPTZ NOT NULL
);

CREATE TABLE verification_token (
  identifier TEXT NOT NULL,
  token      TEXT NOT NULL,
  expires    TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (identifier, token)
);

-- ============================================================
-- Glossaires centralisés
-- ============================================================
CREATE TABLE glossaries (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE glossary_entries (
  id           SERIAL PRIMARY KEY,
  glossary_id  INTEGER NOT NULL REFERENCES glossaries(id) ON DELETE CASCADE,
  source_term  TEXT NOT NULL,
  target_term  TEXT NOT NULL,
  source_lang  VARCHAR(20),
  target_lang  VARCHAR(20),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX glossary_entries_glossary_id_idx ON glossary_entries(glossary_id);

-- Convention : une ligne n'est insérée QUE lorsque enabled = FALSE
-- Absence de ligne → glossaire activé par défaut pour cet utilisateur
CREATE TABLE user_glossary_prefs (
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  glossary_id  INTEGER NOT NULL REFERENCES glossaries(id) ON DELETE CASCADE,
  enabled      BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (user_id, glossary_id)
);

-- ============================================================
-- Exemple : ajouter un utilisateur autorisé
-- INSERT INTO users (email, name) VALUES ('admin@example.com', 'Admin');
-- ============================================================

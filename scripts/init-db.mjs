// Script d'initialisation de la base de données Leksis
// Usage : node scripts/init-db.mjs
import pg from 'pg'
const { Client } = pg

const HOST     = '192.168.40.225'
const PORT     = 5432
const SU_USER  = 'postgres'
const SU_PASS  = process.env.PG_SUPERUSER_PASSWORD
const DB_NAME  = 'leksis'
const DB_USER  = 'leksis_user'
const DB_PASS  = process.env.LEKSIS_DB_PASSWORD

function log(msg)  { console.log(`  ✓ ${msg}`) }
function warn(msg) { console.warn(`  ⚠ ${msg}`) }

async function run(client, sql, label) {
  try {
    await client.query(sql)
    if (label) log(label)
  } catch (err) {
    if (err.code === '42710' || err.code === '42P04') {
      warn(`Déjà existant — ${label ?? sql.slice(0, 60)}`)
    } else {
      throw err
    }
  }
}

// ── 1. Connexion au cluster (DB postgres) pour créer DB + user ──────────────
console.log('\n🚀 Leksis DB Init\n')
console.log(`Connexion à ${HOST}:${PORT} en tant que ${SU_USER}…`)

const su = new Client({
  host: HOST, port: PORT,
  user: SU_USER, password: SU_PASS,
  database: 'postgres',
})
await su.connect()
log('Connecté au cluster PostgreSQL')

await run(su, `CREATE DATABASE ${DB_NAME}`, `Base de données '${DB_NAME}' créée`)
await run(su, `CREATE USER ${DB_USER} WITH ENCRYPTED PASSWORD '${DB_PASS}'`, `Utilisateur '${DB_USER}' créé`)
await run(su, `GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER}`, `Droits accordés à ${DB_USER}`)
await su.end()

// ── 2. Connexion à la DB leksis pour créer les tables ───────────────────────
console.log(`\nCréation des tables dans '${DB_NAME}'…`)

const db = new Client({
  host: HOST, port: PORT,
  user: SU_USER, password: SU_PASS,
  database: DB_NAME,
})
await db.connect()

// Permissions schéma public
await db.query(`GRANT ALL ON SCHEMA public TO ${DB_USER}`)
await db.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${DB_USER}`)
await db.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${DB_USER}`)

// Extension UUID
await run(db, `CREATE EXTENSION IF NOT EXISTS "pgcrypto"`, 'Extension pgcrypto')

// Table users
await run(db, `
  CREATE TABLE IF NOT EXISTS users (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name            TEXT,
    email           TEXT UNIQUE NOT NULL,
    "emailVerified" TIMESTAMPTZ,
    image           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
  )
`, 'Table users')

// Table otp_tokens
await run(db, `
  CREATE TABLE IF NOT EXISTS otp_tokens (
    id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    email      TEXT NOT NULL,
    token      TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used       BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`, 'Table otp_tokens')

await run(db, `
  CREATE INDEX IF NOT EXISTS otp_tokens_email_idx ON otp_tokens(email)
`, 'Index otp_tokens_email_idx')

// Table accounts (NextAuth)
await run(db, `
  CREATE TABLE IF NOT EXISTS accounts (
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
  )
`, 'Table accounts')

// Table sessions (NextAuth)
await run(db, `
  CREATE TABLE IF NOT EXISTS sessions (
    id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "sessionToken" TEXT UNIQUE NOT NULL,
    "userId"       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires        TIMESTAMPTZ NOT NULL
  )
`, 'Table sessions')

// Table verification_token (NextAuth)
await run(db, `
  CREATE TABLE IF NOT EXISTS verification_token (
    identifier TEXT NOT NULL,
    token      TEXT NOT NULL,
    expires    TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (identifier, token)
  )
`, 'Table verification_token')

await db.end()

console.log('\n✅ Base de données initialisée avec succès.')
console.log(`\n   DATABASE_URL = postgresql://${DB_USER}:${DB_PASS}@${HOST}:${PORT}/${DB_NAME}`)
console.log('\n   Ajouter un utilisateur :')
console.log(`   psql -h ${HOST} -U ${DB_USER} -d ${DB_NAME} -c "INSERT INTO users (email, name) VALUES ('toi@exemple.com', 'Admin');"`)
console.log('')

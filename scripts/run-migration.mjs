/**
 * Leksis — Migration admin
 * Usage : PG_SUPERUSER_PASSWORD=<pwd> node scripts/run-migration.mjs
 *
 * Le ALTER TABLE sur users nécessite le superuser (propriétaire de la table).
 * Les nouvelles tables sont créées par leksis_user.
 */
import pg from 'pg'

const { Client } = pg

const HOST    = process.env.LEKSIS_DB_HOST     ?? '192.168.40.225'
const PORT    = Number(process.env.LEKSIS_DB_PORT) || 5432
const DB_NAME = process.env.LEKSIS_DB_NAME     ?? 'leksis'
const DB_USER = process.env.LEKSIS_DB_USER     ?? 'leksis_user'
const DB_PASS = process.env.LEKSIS_DB_PASSWORD ?? 'leksisdb2025' // fallback for local dev only
const SU_USER = 'postgres'
const SU_PASS = process.env.PG_SUPERUSER_PASSWORD

if (!SU_PASS) {
  console.error('❌ Variable PG_SUPERUSER_PASSWORD manquante.')
  console.error('   Usage : PG_SUPERUSER_PASSWORD=<mot_de_passe_postgres> node scripts/run-migration.mjs')
  process.exit(1)
}

if (!process.env.LEKSIS_DB_PASSWORD) {
  console.warn('  ⚠ LEKSIS_DB_PASSWORD non définie — utilisation du mot de passe par défaut (local uniquement).')
}

function log(msg)  { console.log(`  ✓ ${msg}`) }
function warn(msg) { console.warn(`  ⚠ ${msg}`) }

async function run(client, sql, params, label) {
  try {
    await client.query(sql, params ?? [])
    if (label) log(label)
  } catch (err) {
    if (['42701', '42P07', '23505', '42P16'].includes(err.code)) {
      warn(`Déjà existant — ${label ?? sql.slice(0, 60).trim()}`)
    } else {
      throw err
    }
  }
}

console.log('\n🚀 Leksis Admin Migration\n')

// ── Étape 1 : superuser → ALTER TABLE users ─────────────────────────────────
const su = new Client({ host: HOST, port: PORT, user: SU_USER, password: SU_PASS, database: DB_NAME })
await su.connect()
log('Connecté en superuser')

await run(su,
  `ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user' NOT NULL CHECK (role IN ('user', 'admin'))`,
  null,
  "Colonne 'role' ajoutée sur users"
)

await su.end()

// ── Étape 2 : leksis_user → nouvelles tables et données ─────────────────────
const db = new Client({ host: HOST, port: PORT, user: DB_USER, password: DB_PASS, database: DB_NAME })
await db.connect()
log('Connecté en tant que leksis_user')

// Table site_settings
await run(db, `
  CREATE TABLE IF NOT EXISTS site_settings (
    key        TEXT PRIMARY KEY,
    value      JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by TEXT REFERENCES users(id)
  )
`, null, 'Table site_settings')

// Utilisateur admin par défaut
await run(db,
  `INSERT INTO users (email, name, role) VALUES ($1, $2, $3) ON CONFLICT (email) DO UPDATE SET role = $3`,
  ['admin@leksis.ch', 'Administrateur', 'admin'],
  'Utilisateur admin@leksis.ch créé/mis à jour'
)

// Valeurs par défaut des réglages
const defaults = [
  ['branding',      { siteName: 'Leksis', primaryColor: '#565e74', secondaryColor: '#506076', darkMode: false }],
  ['design',        { buttonRadius: '0.75rem', headerLogoSize: '32', footerText: '© Leksis', footerLinks: [] }],
  ['general',       { contactEmail: '', globalBanner: '', maintenanceMode: false, maintenanceMessage: '' }],
  ['seo',           { title: 'Leksis', description: '' }],
  ['ollama_config', { baseUrl: 'http://192.168.1.39:11434', model: 'translategemma:27b' }],
  ['db_config',     { host: HOST, port: PORT, database: DB_NAME, user: DB_USER, passwordEnc: '' }],
]

for (const [key, value] of defaults) {
  await run(db,
    `INSERT INTO site_settings (key, value) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO NOTHING`,
    [key, JSON.stringify(value)],
    `Réglage '${key}' initialisé`
  )
}

// Table audit_log
await run(db, `
  CREATE TABLE IF NOT EXISTS audit_log (
    id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id    TEXT REFERENCES users(id),
    user_email TEXT NOT NULL,
    action     TEXT NOT NULL,
    resource   TEXT NOT NULL,
    detail     JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`, null, 'Table audit_log')

await run(db,
  `CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON audit_log(created_at DESC)`,
  null,
  'Index audit_log_created_at_idx'
)

await db.end()
console.log('\n✅ Migration appliquée avec succès.\n')

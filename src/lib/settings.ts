import 'server-only'
import { query } from '@/lib/db'
import { logAudit } from '@/lib/audit'

// Chaque requête d'API lit plusieurs réglages (maintenance, fonctionnalités, limites, modèle IA…) : un cache court
// évite ces allers-retours SQL. Toute écriture par l'application vide le cache tout de suite ; le TTL borne le
// retard pour les modifications faites hors de l'application (install.sh écrit ai_config, caddy_config… par psql).
export const SETTINGS_TTL_MS = 5_000

type Entry = { value: unknown; at: number }
const cache = new Map<string, Entry>()
const inflight = new Map<string, Promise<unknown>>() // lectures en cours : une seule requête SQL par clé

// Les appelants reçoivent leur propre copie : modifier l'objet reçu ne doit pas altérer le cache
const copy = <T,>(v: T): T => structuredClone(v)

function fresh(entry: Entry | undefined): entry is Entry {
  return !!entry && Date.now() - entry.at < SETTINGS_TTL_MS
}

/** Vide le cache (tout, ou une clé). Appelé à chaque écriture ; utile aussi aux tests. */
export function invalidateSettings(key?: string): void {
  if (key === undefined) cache.clear()
  else cache.delete(key)
  // Une lecture déjà partie a pu voir l'ancienne valeur : son résultat ne doit pas repeupler le cache
  inflight.clear()
}

/**
 * Lit la valeur d'une clé de réglage.
 * Retourne un objet vide si la clé n'existe pas.
 */
export async function getSetting<T = Record<string, unknown>>(key: string): Promise<T> {
  const hit = cache.get(key)
  if (fresh(hit)) return copy(hit.value as T)

  let pending = inflight.get(key) as Promise<unknown> | undefined
  if (!pending) {
    const p: Promise<unknown> = query<{ value: unknown }>('SELECT value FROM site_settings WHERE key = $1', [key])
      .then(result => {
        const value = result.rows[0]?.value ?? {}
        if (inflight.get(key) === p) cache.set(key, { value, at: Date.now() })
        return value
      })
      .finally(() => { if (inflight.get(key) === p) inflight.delete(key) })
    inflight.set(key, p)
    pending = p
  }
  return copy((await pending) as T)
}

/**
 * Remplace la valeur d'une clé de réglage (pas de fusion : l'appelant fournit la valeur complète) et journalise.
 * `auditValue` : version expurgée de la valeur pour le journal (secrets, même chiffrés).
 */
export async function updateSetting(
  key: string,
  value: object,
  userId: string,
  userEmail: string,
  auditValue?: object
): Promise<void> {
  await query(
    `INSERT INTO site_settings (key, value, updated_at, updated_by)
     VALUES ($1, $2::jsonb, NOW(), $3)
     ON CONFLICT (key) DO UPDATE
       SET value      = $2::jsonb,
           updated_at = NOW(),
           updated_by = $3`,
    [key, JSON.stringify(value), userId]
  )
  invalidateSettings(key)
  await logAudit(userId, userEmail, 'UPDATE_SETTINGS', `settings:${key}`, auditValue ?? value)
}

/**
 * Lit tous les réglages en une seule requête (et remplit le cache clé par clé).
 */
export async function getAllSettings(): Promise<Record<string, unknown>> {
  const result = await query<{ key: string; value: unknown }>(
    'SELECT key, value FROM site_settings'
  )
  const now = Date.now()
  for (const r of result.rows) cache.set(r.key, { value: r.value, at: now })
  return copy(Object.fromEntries(result.rows.map(r => [r.key, r.value])))
}

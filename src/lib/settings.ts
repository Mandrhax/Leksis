import 'server-only'
import { query } from '@/lib/db'
import { logAudit } from '@/lib/audit'

/**
 * Lit la valeur d'une clé de réglage.
 * Retourne un objet vide si la clé n'existe pas.
 */
export async function getSetting<T = Record<string, unknown>>(key: string): Promise<T> {
  const result = await query<{ value: T }>(
    'SELECT value FROM site_settings WHERE key = $1',
    [key]
  )
  return (result.rows[0]?.value ?? {}) as T
}

/**
 * Met à jour une clé de réglage (merge partiel) et journalise.
 */
export async function updateSetting(
  key: string,
  value: object,
  userId: string,
  userEmail: string
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
  await logAudit(userId, userEmail, 'UPDATE_SETTINGS', `settings:${key}`, value)
}

/**
 * Lit tous les réglages en une seule requête.
 */
export async function getAllSettings(): Promise<Record<string, unknown>> {
  const result = await query<{ key: string; value: unknown }>(
    'SELECT key, value FROM site_settings'
  )
  return Object.fromEntries(result.rows.map(r => [r.key, r.value]))
}

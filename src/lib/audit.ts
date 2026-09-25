import 'server-only'
import { query } from '@/lib/db'

/**
 * Enregistre une entrée dans le journal d'audit.
 * Une erreur est journalisée dans la console du serveur mais ne bloque pas l'action admin.
 */
export async function logAudit(
  userId: string,
  email: string,
  action: string,
  resource: string,
  detail?: object
): Promise<void> {
  try {
    await query(
      `INSERT INTO audit_log (user_id, user_email, action, resource, detail)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, email, action, resource, detail ? JSON.stringify(detail) : null]
    )
  } catch (err) {
    // Ne pas bloquer l'action principale si l'audit échoue — mais ne pas le faire en silence
    console.error(`[audit] failed to record ${action} on ${resource}:`, err)
  }
}

/**
 * Texte lisible de la colonne « ressource » : `user:<id>` devient `user:<email>` (le compte, ou à défaut l'email
 * gardé dans `detail` — un compte supprimé n'existe plus en base). Les autres ressources restent telles quelles.
 */
export async function labelAuditResources<T extends { resource: string; detail?: unknown }>(
  rows: T[],
): Promise<(T & { resource_label: string })[]> {
  const ids = [...new Set(rows.flatMap(r => (r.resource.startsWith('user:') ? [r.resource.slice(5)] : [])))]
  const emails = new Map<string, string>()
  if (ids.length) {
    try {
      const found = await query<{ id: string; email: string }>('SELECT id, email FROM users WHERE id = ANY($1)', [ids])
      for (const u of found.rows) emails.set(u.id, u.email)
    } catch (err) {
      console.error('[audit] could not resolve user names:', err) // l'identifiant brut reste affiché
    }
  }
  return rows.map(r => {
    if (!r.resource.startsWith('user:')) return { ...r, resource_label: r.resource }
    const id = r.resource.slice(5)
    const detailEmail = (r.detail as { email?: unknown } | null)?.email
    const email = emails.get(id) ?? (typeof detailEmail === 'string' ? detailEmail : null)
    return { ...r, resource_label: `user:${email ?? id}` }
  })
}

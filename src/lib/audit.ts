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
 * Texte lisible de la colonne « ressource » :
 * - `user:<id>` devient `user:<email>` (le compte, ou à défaut l'email gardé dans `detail` — un compte supprimé
 *   n'existe plus en base) ;
 * - `glossary:<id>` devient `glossary:<nom>` (le glossaire, ou à défaut le nom gardé dans `detail`) ;
 * - `feedback:<id>` devient `feedback:<email de l'auteur>` (le message, ou à défaut l'email gardé dans `detail`).
 * Les autres ressources restent telles quelles.
 */
export async function labelAuditResources<T extends { resource: string; detail?: unknown }>(
  rows: T[],
): Promise<(T & { resource_label: string })[]> {
  const idsOf = (prefix: string) =>
    [...new Set(rows.flatMap(r => (r.resource.startsWith(prefix) ? [r.resource.slice(prefix.length)] : [])))]

  const userIds = idsOf('user:')
  const emails = new Map<string, string>()
  if (userIds.length) {
    try {
      const found = await query<{ id: string; email: string }>('SELECT id, email FROM users WHERE id = ANY($1)', [userIds])
      for (const u of found.rows) emails.set(u.id, u.email)
    } catch (err) {
      console.error('[audit] could not resolve user names:', err) // l'identifiant brut reste affiché
    }
  }

  const glossaryIds = idsOf('glossary:').filter(id => /^\d+$/.test(id)).map(Number)
  const glossaryNames = new Map<string, string>()
  if (glossaryIds.length) {
    try {
      const found = await query<{ id: number; name: string }>('SELECT id, name FROM glossaries WHERE id = ANY($1::int[])', [glossaryIds])
      for (const g of found.rows) glossaryNames.set(String(g.id), g.name)
    } catch (err) {
      console.error('[audit] could not resolve glossary names:', err)
    }
  }

  const feedbackIds = idsOf('feedback:')
  const feedbackAuthors = new Map<string, string>()
  if (feedbackIds.length) {
    try {
      const found = await query<{ id: string; user_email: string }>('SELECT id, user_email FROM feedback WHERE id = ANY($1)', [feedbackIds])
      for (const f of found.rows) feedbackAuthors.set(f.id, f.user_email)
    } catch (err) {
      console.error('[audit] could not resolve feedback authors:', err)
    }
  }

  return rows.map(r => {
    if (r.resource.startsWith('feedback:')) {
      const id = r.resource.slice('feedback:'.length)
      const detailEmail = (r.detail as { email?: unknown } | null)?.email
      const email = feedbackAuthors.get(id) ?? (typeof detailEmail === 'string' ? detailEmail : null)
      return { ...r, resource_label: email ? `feedback:${email}` : r.resource }
    }
    if (r.resource.startsWith('user:')) {
      const id = r.resource.slice('user:'.length)
      const detailEmail = (r.detail as { email?: unknown } | null)?.email
      const email = emails.get(id) ?? (typeof detailEmail === 'string' ? detailEmail : null)
      return { ...r, resource_label: `user:${email ?? id}` }
    }
    if (r.resource.startsWith('glossary:')) {
      const id = r.resource.slice('glossary:'.length)
      const detailName = (r.detail as { name?: unknown } | null)?.name
      const name = glossaryNames.get(id) ?? (typeof detailName === 'string' ? detailName : null)
      return { ...r, resource_label: `glossary:${name ?? id}` }
    }
    return { ...r, resource_label: r.resource }
  })
}

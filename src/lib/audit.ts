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

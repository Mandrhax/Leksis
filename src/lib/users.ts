import 'server-only'
import { query } from '@/lib/db'

// Le rôle est figé dans le JWT à la connexion (30 jours). Pour qu'une rétrogradation ou une suppression
// prenne effet sans attendre l'expiration, on le relit en base à chaque lecture de session, avec un cache
// court pour ne pas ajouter une requête SQL à chaque appel d'API.
const ROLE_TTL_MS = 30_000
const cache = new Map<string, { role: string | null; at: number }>()

/**
 * Rôle actuel d'un utilisateur, ou null s'il n'existe plus. Lève si la base est injoignable
 * (à l'appelant de décider : la session ne doit pas sauter à cause d'une coupure de base).
 */
export async function getUserRole(userId: string, opts: { fresh?: boolean } = {}): Promise<string | null> {
  const hit = cache.get(userId)
  if (!opts.fresh && hit && Date.now() - hit.at < ROLE_TTL_MS) return hit.role

  const r = await query<{ role: string }>('SELECT role FROM users WHERE id = $1', [userId])
  const role = r.rows[0]?.role ?? null
  cache.set(userId, { role, at: Date.now() })
  return role
}

/** À appeler quand le rôle d'un utilisateur change : la prochaine lecture de session le relit en base. */
export function invalidateUserRole(userId: string): void {
  cache.delete(userId)
}

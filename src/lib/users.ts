import 'server-only'
import { query, withTransaction } from '@/lib/db'

// Le rôle est figé dans le JWT à la connexion (30 jours). Pour qu'une rétrogradation, une désactivation ou une
// suppression prenne effet sans attendre l'expiration, on le relit en base à chaque lecture de session, avec un
// cache court pour ne pas ajouter une requête SQL à chaque appel d'API.
const ROLE_TTL_MS = 30_000
const cache = new Map<string, { role: string | null; at: number }>()

/**
 * Rôle actuel d'un utilisateur, ou null s'il n'existe plus ou si son compte est désactivé (la session
 * doit alors être invalidée). Lève si la base est injoignable (à l'appelant de décider : la session ne doit
 * pas sauter à cause d'une coupure de base).
 */
export async function getUserRole(userId: string, opts: { fresh?: boolean } = {}): Promise<string | null> {
  const hit = cache.get(userId)
  if (!opts.fresh && hit && Date.now() - hit.at < ROLE_TTL_MS) return hit.role

  const r = await query<{ role: string; disabled: boolean }>('SELECT role, disabled FROM users WHERE id = $1', [userId])
  const row = r.rows[0]
  const role = row && !row.disabled ? row.role : null
  cache.set(userId, { role, at: Date.now() })
  return role
}

/** À appeler quand un utilisateur change (rôle, désactivation, suppression) : la prochaine lecture de session relit la base. */
export function invalidateUserRole(userId: string): void {
  cache.delete(userId)
}

// ── Administration des comptes ─────────────────────────────────

export interface UserRow {
  id: string
  email: string
  name: string | null
  role: string
  disabled: boolean
  created_at: string
}

export const USERS_DEFAULT_PAGE_SIZE = 25
export const USERS_MAX_PAGE_SIZE = 100

/** Page d'utilisateurs, du plus récent au plus ancien ; `q` filtre sur l'email ou le nom. */
export async function listUsers(opts: { page?: number; pageSize?: number; q?: string } = {}): Promise<{
  users: UserRow[]; total: number; page: number; pageSize: number
}> {
  const pageSize = Math.min(Math.max(Math.trunc(opts.pageSize ?? USERS_DEFAULT_PAGE_SIZE) || USERS_DEFAULT_PAGE_SIZE, 1), USERS_MAX_PAGE_SIZE)
  const q = (opts.q ?? '').trim().slice(0, 100)
  // % et _ saisis par l'admin sont des caractères ordinaires, pas des jokers
  const pattern = `%${q.replace(/[\\%_]/g, '\\$&')}%`

  const count = await query<{ n: string }>(
    `SELECT count(*) AS n FROM users WHERE $1 = '' OR email ILIKE $2 OR COALESCE(name, '') ILIKE $2`,
    [q, pattern],
  )
  const total = Number(count.rows[0]?.n ?? 0)
  const lastPage = Math.max(Math.ceil(total / pageSize), 1)
  const page = Math.min(Math.max(Math.trunc(opts.page ?? 1) || 1, 1), lastPage)

  const rows = await query<UserRow>(
    `SELECT id, email, name, role, disabled, created_at
     FROM users
     WHERE $1 = '' OR email ILIKE $2 OR COALESCE(name, '') ILIKE $2
     ORDER BY created_at DESC, id
     LIMIT $3 OFFSET $4`,
    [q, pattern, pageSize, (page - 1) * pageSize],
  )
  return { users: rows.rows, total, page, pageSize }
}

export type UserChangeError = 'not_found' | 'self' | 'last_admin'
export type UserChangeResult = { ok: true; user: UserRow } | { ok: false; error: UserChangeError }

// Clé du verrou qui sérialise les changements pouvant retirer un administrateur actif
const ADMIN_LOCK = 'leksis:admin-changes'

/**
 * Les garde-fous s'appliquent ici, dans une transaction verrouillée, pas dans les routes : deux admins qui
 * se rétrogradent en même temps ne peuvent pas tous deux réussir.
 *  - on ne peut pas se rétrograder, se désactiver ni se supprimer soi-même ;
 *  - il doit toujours rester au moins un administrateur actif (rôle admin, compte non désactivé).
 */
async function mutateUser(
  actorId: string,
  id: string,
  apply: (q: Parameters<Parameters<typeof withTransaction>[0]>[0], target: UserRow) => Promise<void>,
  removesAdmin: (target: UserRow) => boolean,
): Promise<UserChangeResult> {
  const result = await withTransaction<UserChangeResult>(async q => {
    await q('SELECT pg_advisory_xact_lock(hashtext($1))', [ADMIN_LOCK])
    const found = await q<UserRow>(
      'SELECT id, email, name, role, disabled, created_at FROM users WHERE id = $1 FOR UPDATE',
      [id],
    )
    const target = found.rows[0]
    if (!target) return { ok: false, error: 'not_found' }

    if (removesAdmin(target)) {
      if (target.id === actorId) return { ok: false, error: 'self' }
      if (target.role === 'admin' && !target.disabled) {
        const others = await q<{ n: string }>(
          `SELECT count(*) AS n FROM users WHERE role = 'admin' AND NOT disabled AND id <> $1`,
          [id],
        )
        if (Number(others.rows[0].n) === 0) return { ok: false, error: 'last_admin' }
      }
    }

    await apply(q, target)
    return { ok: true, user: target }
  })
  invalidateUserRole(id)
  return result
}

/** Change le rôle et/ou l'état (actif / désactivé) d'un compte. */
export async function changeUser(
  actorId: string,
  id: string,
  change: { role?: 'user' | 'admin'; disabled?: boolean },
): Promise<UserChangeResult> {
  return mutateUser(
    actorId, id,
    async (q, target) => {
      const role = change.role ?? target.role
      const disabled = change.disabled ?? target.disabled
      await q('UPDATE users SET role = $2, disabled = $3 WHERE id = $1', [id, role, disabled])
      target.role = role
      target.disabled = disabled
    },
    target => (change.role === 'user' && target.role === 'admin') || change.disabled === true,
  )
}

/** Supprime un compte (ses préférences de glossaire partent avec ; l'historique d'usage et d'audit est conservé). */
export function removeUser(actorId: string, id: string): Promise<UserChangeResult> {
  return mutateUser(
    actorId, id,
    async q => { await q('DELETE FROM users WHERE id = $1', [id]) },
    () => true,
  )
}

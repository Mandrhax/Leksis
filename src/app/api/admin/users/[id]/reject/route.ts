import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-guard'
import { logAudit } from '@/lib/audit'
import { removeUser, type UserChangeError } from '@/lib/users'

// `code` is stable: the admin UI translates it (see t.userList.err*)
const ERRORS: Record<UserChangeError, { status: number; error: string }> = {
  not_found:   { status: 404, error: 'User not found.' },
  self:        { status: 400, error: 'You cannot demote, disable or delete your own account.' },
  last_admin:  { status: 400, error: 'At least one active administrator must remain.' },
  not_pending: { status: 400, error: 'This account is not pending approval.' },
}

// Un compte en attente de validation admin est toujours role='user' (jamais promu avant d'être actif) :
// removeUser() applique déjà les bons garde-fous, pas besoin d'une logique de rejet dédiée.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

    const { id } = await params
    const result = await removeUser(session.user.id, id)
    if (!result.ok) {
      const { status, error } = ERRORS[result.error]
      return NextResponse.json({ error, code: result.error }, { status })
    }

    await logAudit(session.user.id, session.user.email!, 'REJECT_USER', `user:${id}`, { email: result.user.email })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[POST /api/admin/users/[id]/reject]', err)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-guard'
import { logAudit } from '@/lib/audit'
import { approveUser, type UserChangeError } from '@/lib/users'

// `code` is stable: the admin UI translates it (see t.userList.err*)
const ERRORS: Record<UserChangeError, { status: number; error: string }> = {
  not_found:   { status: 404, error: 'User not found.' },
  self:        { status: 400, error: 'You cannot demote, disable or delete your own account.' },
  last_admin:  { status: 400, error: 'At least one active administrator must remain.' },
  not_pending: { status: 400, error: 'This account is not pending approval.' },
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

    const { id } = await params
    const result = await approveUser(session.user.id, id)
    if (!result.ok) {
      const { status, error } = ERRORS[result.error]
      return NextResponse.json({ error, code: result.error }, { status })
    }

    await logAudit(session.user.id, session.user.email!, 'APPROVE_USER', `user:${id}`, { email: result.user.email })
    return NextResponse.json({ ok: true, user: result.user })
  } catch (err) {
    console.error('[POST /api/admin/users/[id]/approve]', err)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}

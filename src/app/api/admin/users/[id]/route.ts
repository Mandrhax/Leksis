import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminSession } from '@/lib/admin-guard'
import { logAudit } from '@/lib/audit'
import { changeUser, removeUser, type UserChangeError } from '@/lib/users'

const Schema = z.object({
  role:     z.enum(['user', 'admin']).optional(),
  disabled: z.boolean().optional(),
}).refine(v => v.role !== undefined || v.disabled !== undefined)

// `code` is stable: the admin UI translates it (see t.userList.err*)
const ERRORS: Record<UserChangeError, { status: number; error: string }> = {
  not_found:  { status: 404, error: 'User not found.' },
  self:       { status: 400, error: 'You cannot demote, disable or delete your own account.' },
  last_admin: { status: 400, error: 'At least one active administrator must remain.' },
}

function failure(code: UserChangeError) {
  const { status, error } = ERRORS[code]
  return NextResponse.json({ error, code }, { status })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

    const { id } = await params
    const parsed = Schema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid data.', code: 'invalid' }, { status: 400 })
    }

    const result = await changeUser(session.user.id, id, parsed.data)
    if (!result.ok) return failure(result.error)

    const { role, disabled } = parsed.data
    const target = `user:${id}`
    const detail = { email: result.user.email }
    if (role !== undefined)     await logAudit(session.user.id, session.user.email!, 'UPDATE_ROLE', target, { ...detail, role })
    if (disabled !== undefined) await logAudit(session.user.id, session.user.email!, disabled ? 'DISABLE_USER' : 'ENABLE_USER', target, detail)

    return NextResponse.json({ ok: true, user: result.user })
  } catch (err) {
    console.error('[PATCH /api/admin/users/[id]]', err)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

    const { id } = await params
    const result = await removeUser(session.user.id, id)
    if (!result.ok) return failure(result.error)

    await logAudit(session.user.id, session.user.email!, 'DELETE_USER', `user:${id}`, { email: result.user.email })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[DELETE /api/admin/users/[id]]', err)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}

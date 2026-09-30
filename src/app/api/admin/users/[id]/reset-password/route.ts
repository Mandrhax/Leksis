import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-guard'
import { logAudit } from '@/lib/audit'
import { resetUserPassword } from '@/lib/users'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

    const { id } = await params
    const result = await resetUserPassword(id)
    if (!result.ok) {
      return NextResponse.json({ error: 'User not found.', code: result.error }, { status: 404 })
    }

    // Le mot de passe en clair ne part jamais dans le journal d'audit, ni ailleurs qu'ici, une seule fois
    await logAudit(session.user.id, session.user.email!, 'RESET_PASSWORD', `user:${id}`, { email: result.email })
    return NextResponse.json({ ok: true, email: result.email, password: result.password })
  } catch (err) {
    console.error('[POST /api/admin/users/[id]/reset-password]', err)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}

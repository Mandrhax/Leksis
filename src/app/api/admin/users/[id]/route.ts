import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminSession } from '@/lib/admin-guard'
import { query } from '@/lib/db'
import { logAudit } from '@/lib/audit'

const Schema = z.object({ role: z.enum(['user', 'admin']) })

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

    const { id } = await params
    const body   = await req.json().catch(() => null)
    const parsed = Schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Données invalides' }, { status: 400 })
    }

    const newRole = parsed.data.role

    // Un admin ne peut pas se rétrograder lui-même
    if (session.user.id && id === session.user.id && newRole !== 'admin') {
      return NextResponse.json(
        { error: 'Vous ne pouvez pas rétrograder votre propre compte.' },
        { status: 400 },
      )
    }

    const result = await query(
      'UPDATE users SET role = $1 WHERE id = $2 RETURNING id',
      [newRole, id],
    )

    if (!result.rowCount) {
      return NextResponse.json({ error: 'Utilisateur introuvable.' }, { status: 404 })
    }

    await logAudit(session.user.id, session.user.email!, 'UPDATE_ROLE', `user:${id}`, { role: newRole })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[PATCH /api/admin/users/[id]]', err)
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

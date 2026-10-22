import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-guard'
import { logAudit } from '@/lib/audit'
import { deleteFeedback, getFeedback, updateFeedback } from '@/lib/feedback'
import { FeedbackUpdateSchema } from '@/lib/feedback-schema'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  const { id } = await params
  try {
    const item = await getFeedback(id)
    if (!item) return NextResponse.json({ error: 'Not found.', code: 'not_found' }, { status: 404 })
    return NextResponse.json(item)
  } catch (err) {
    console.error('[GET /api/admin/feedback/:id] ERROR:', err)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}

/** Statut et/ou note interne. Audit : le changement de statut ; la note n'y figure pas (signalée par `noteChanged`). */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  const { id } = await params

  const parsed = FeedbackUpdateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })

  try {
    const r = await updateFeedback(id, parsed.data)
    if (!r) return NextResponse.json({ error: 'Not found.', code: 'not_found' }, { status: 404 })
    const statusChanged = r.before.status !== r.after.status
    const noteChanged = r.before.admin_note !== r.after.admin_note
    if (statusChanged || noteChanged) {
      await logAudit(session.user.id, session.user.email!, 'UPDATE_FEEDBACK', `feedback:${id}`, {
        ...(statusChanged ? { before: r.before.status, after: r.after.status } : {}),
        ...(noteChanged ? { noteChanged: true } : {}),
      })
    }
    return NextResponse.json({ ok: true, status: r.after.status, admin_note: r.after.admin_note })
  } catch (err) {
    console.error('[PATCH /api/admin/feedback/:id] ERROR:', err)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  const { id } = await params
  try {
    const removed = await deleteFeedback(id)
    if (!removed) return NextResponse.json({ error: 'Not found.', code: 'not_found' }, { status: 404 })
    await logAudit(session.user.id, session.user.email!, 'DELETE_FEEDBACK', `feedback:${id}`, {
      email: removed.user_email, category: removed.category,
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[DELETE /api/admin/feedback/:id] ERROR:', err)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}

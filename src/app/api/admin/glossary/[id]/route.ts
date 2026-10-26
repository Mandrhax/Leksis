import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-guard'
import { query } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { glossaryChanged } from '@/lib/glossary'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const groupNameSchema = z.string().max(100).optional().transform((v) => (v?.trim() ? v.trim() : null))

const updateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  groupName: groupNameSchema,
})

// PATCH /api/admin/glossary/[id] — rename, re-describe or re-group a glossary (not its terms)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const { id } = await params
  const glossaryId = parseInt(id, 10)
  if (isNaN(glossaryId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const body = await req.json().catch(() => null)
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  const { name, description, groupName } = parsed.data

  const before = await query<{ name: string; group_name: string | null }>(
    'SELECT name, group_name FROM glossaries WHERE id = $1', [glossaryId],
  )
  if (!before.rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const result = await query(
    `UPDATE glossaries SET name = $1, description = $2, group_name = $3 WHERE id = $4
     RETURNING id, name, description, group_name, created_at`,
    [name, description ?? null, groupName, glossaryId],
  )

  const g = result.rows[0]
  glossaryChanged()
  await logAudit(session.user.id, session.user.email!, 'UPDATE_GLOSSARY', `glossary:${glossaryId}`, {
    before: { name: before.rows[0].name, groupName: before.rows[0].group_name },
    after: { name: g.name, groupName: g.group_name },
  })
  // entryCount / createdAt stay as the client already has them — this route never touches the terms
  return NextResponse.json({ id: g.id, name: g.name, description: g.description, groupName: g.group_name })
}

// DELETE /api/admin/glossary/[id] — delete a glossary (cascades entries + prefs)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const { id } = await params
  const glossaryId = parseInt(id, 10)
  if (isNaN(glossaryId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  // Le nom est lu avant la suppression : il reste dans le journal alors que le glossaire n'existe plus
  const found = await query('SELECT name, (SELECT count(*)::int FROM glossary_entries WHERE glossary_id = $1) AS terms FROM glossaries WHERE id = $1', [glossaryId])
  await query('DELETE FROM glossaries WHERE id = $1', [glossaryId])
  if (found.rows[0]) {
    glossaryChanged()
    await logAudit(session.user.id, session.user.email!, 'DELETE_GLOSSARY', `glossary:${glossaryId}`, { name: found.rows[0].name, terms: found.rows[0].terms })
  }

  return NextResponse.json({ ok: true })
}

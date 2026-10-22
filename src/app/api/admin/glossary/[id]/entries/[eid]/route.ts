import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-guard'
import { query } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { entrySchema, ENTRY_COLUMNS, entryFromRow, findDuplicateEntry, termDetail } from '@/lib/glossary-entries'

export const dynamic = 'force-dynamic'

// PATCH /api/admin/glossary/[id]/entries/[eid] — edit a single entry (409 `duplicate` if it would clash with another)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; eid: string }> },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const { id, eid } = await params
  const glossaryId = parseInt(id, 10)
  const entryId = parseInt(eid, 10)
  if (isNaN(glossaryId) || isNaN(entryId))
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const body = await req.json().catch(() => null)
  const parsed = entrySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const { source, target, matchVariants } = parsed.data
  const sourceLang = parsed.data.sourceLang || null
  const targetLang = parsed.data.targetLang || null

  const duplicate = await findDuplicateEntry(glossaryId, source, sourceLang, targetLang, entryId)
  if (duplicate) {
    return NextResponse.json({ error: 'This term already exists.', code: 'duplicate', existingTarget: duplicate.target }, { status: 409 })
  }

  const before = await query(`SELECT ${ENTRY_COLUMNS} FROM glossary_entries WHERE id = $1 AND glossary_id = $2`, [entryId, glossaryId])
  const result = await query(
    `UPDATE glossary_entries
     SET source_term = $3, target_term = $4, source_lang = $5, target_lang = $6, match_variants = $7
     WHERE id = $1 AND glossary_id = $2
     RETURNING ${ENTRY_COLUMNS}`,
    [entryId, glossaryId, source, target, sourceLang, targetLang, matchVariants === true],
  )
  if (!result.rows[0]) return NextResponse.json({ error: 'Not found', code: 'not_found' }, { status: 404 })
  const updated = entryFromRow(result.rows[0])
  await logAudit(session.user.id, session.user.email!, 'UPDATE_GLOSSARY_TERM', `glossary:${glossaryId}`, {
    ...termDetail(updated),
    before: before.rows[0] ? termDetail(entryFromRow(before.rows[0])) : null,
  })
  return NextResponse.json(updated)
}

// DELETE /api/admin/glossary/[id]/entries/[eid] — delete a single entry
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; eid: string }> },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const { id, eid } = await params
  const glossaryId = parseInt(id, 10)
  const entryId = parseInt(eid, 10)
  if (isNaN(glossaryId) || isNaN(entryId))
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  // Ensure entry belongs to this glossary (le terme est lu avant la suppression, pour le journal)
  const found = await query(`SELECT ${ENTRY_COLUMNS} FROM glossary_entries WHERE id = $1 AND glossary_id = $2`, [entryId, glossaryId])
  await query(
    'DELETE FROM glossary_entries WHERE id = $1 AND glossary_id = $2',
    [entryId, glossaryId],
  )
  if (found.rows[0]) {
    await logAudit(session.user.id, session.user.email!, 'DELETE_GLOSSARY_TERM', `glossary:${glossaryId}`, termDetail(entryFromRow(found.rows[0])))
  }

  return NextResponse.json({ ok: true })
}

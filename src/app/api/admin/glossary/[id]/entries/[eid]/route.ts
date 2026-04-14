import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-guard'
import { query } from '@/lib/db'

export const dynamic = 'force-dynamic'

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

  // Ensure entry belongs to this glossary
  await query(
    'DELETE FROM glossary_entries WHERE id = $1 AND glossary_id = $2',
    [entryId, glossaryId],
  )

  return NextResponse.json({ ok: true })
}

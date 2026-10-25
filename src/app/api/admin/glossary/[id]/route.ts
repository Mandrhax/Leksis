import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-guard'
import { query } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { glossaryChanged } from '@/lib/glossary'

export const dynamic = 'force-dynamic'

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

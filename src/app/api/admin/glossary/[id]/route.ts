import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-guard'
import { query } from '@/lib/db'

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

  await query('DELETE FROM glossaries WHERE id = $1', [glossaryId])

  return NextResponse.json({ ok: true })
}

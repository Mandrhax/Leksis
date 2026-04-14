import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-guard'
import { query } from '@/lib/db'
import { parseGlossaryCSV } from '@/lib/glossary'

export const dynamic = 'force-dynamic'

// POST /api/admin/glossary/[id]/import — bulk import entries from CSV
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const { id } = await params
  const glossaryId = parseInt(id, 10)
  if (isNaN(glossaryId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const text = await req.text()
  if (!text) return NextResponse.json({ error: 'Empty body' }, { status: 400 })

  const entries = parseGlossaryCSV(text)
  if (!entries.length) return NextResponse.json({ imported: 0 })

  // Insert all entries
  let imported = 0
  for (const entry of entries) {
    try {
      await query(
        `INSERT INTO glossary_entries (glossary_id, source_term, target_term, source_lang, target_lang)
         VALUES ($1, $2, $3, $4, $5)`,
        [glossaryId, entry.source, entry.target, entry.sourceLang, entry.targetLang],
      )
      imported++
    } catch {
      // Skip invalid entries silently
    }
  }

  return NextResponse.json({ imported })
}

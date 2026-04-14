import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-guard'
import { query } from '@/lib/db'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

// GET /api/admin/glossary/[id]/entries — list entries for a glossary
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const { id } = await params
  const glossaryId = parseInt(id, 10)
  if (isNaN(glossaryId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const result = await query(
    `SELECT id, glossary_id, source_term, target_term, source_lang, target_lang, created_at
     FROM glossary_entries
     WHERE glossary_id = $1
     ORDER BY created_at ASC`,
    [glossaryId],
  )

  const entries = result.rows.map((r) => ({
    id: r.id,
    glossaryId: r.glossary_id,
    source: r.source_term,
    target: r.target_term,
    sourceLang: r.source_lang,
    targetLang: r.target_lang,
    createdAt: r.created_at,
  }))

  return NextResponse.json(entries)
}

const entrySchema = z.object({
  source: z.string().min(1).max(500),
  target: z.string().min(1).max(500),
  sourceLang: z.string().max(20).nullable().optional(),
  targetLang: z.string().max(20).nullable().optional(),
})

// POST /api/admin/glossary/[id]/entries — add an entry
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const { id } = await params
  const glossaryId = parseInt(id, 10)
  if (isNaN(glossaryId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const body = await req.json()
  const parsed = entrySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const { source, target, sourceLang, targetLang } = parsed.data

  const result = await query(
    `INSERT INTO glossary_entries (glossary_id, source_term, target_term, source_lang, target_lang)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, glossary_id, source_term, target_term, source_lang, target_lang`,
    [glossaryId, source, target, sourceLang ?? null, targetLang ?? null],
  )

  const r = result.rows[0]
  return NextResponse.json({
    id: r.id,
    glossaryId: r.glossary_id,
    source: r.source_term,
    target: r.target_term,
    sourceLang: r.source_lang,
    targetLang: r.target_lang,
  })
}

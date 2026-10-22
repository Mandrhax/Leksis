import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-guard'
import { query } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { entrySchema, ENTRY_COLUMNS, entryFromRow, findDuplicateEntry, likePattern, termDetail } from '@/lib/glossary-entries'

export const dynamic = 'force-dynamic'

const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 200

// GET /api/admin/glossary/[id]/entries — list entries (search + pagination). `?all=1` returns every entry (CSV export).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const { id } = await params
  const glossaryId = parseInt(id, 10)
  if (isNaN(glossaryId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const sp = req.nextUrl.searchParams
  const q = (sp.get('q') ?? '').trim().slice(0, 200)
  const where = ['glossary_id = $1']
  const args: unknown[] = [glossaryId]
  if (q) {
    args.push(likePattern(q))
    where.push(`(source_term ILIKE $${args.length} OR target_term ILIKE $${args.length})`)
  }
  const order = 'ORDER BY lower(source_term), id'

  if (sp.get('all') === '1') {
    const all = await query(`SELECT ${ENTRY_COLUMNS} FROM glossary_entries WHERE ${where.join(' AND ')} ${order}`, args)
    return NextResponse.json(all.rows.map(entryFromRow))
  }

  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(sp.get('pageSize') ?? '', 10) || DEFAULT_PAGE_SIZE))
  const page = Math.max(1, parseInt(sp.get('page') ?? '', 10) || 1)

  const count = await query(`SELECT count(*)::int AS n FROM glossary_entries WHERE ${where.join(' AND ')}`, args)
  const total = (count.rows[0]?.n as number) ?? 0

  const rows = await query(
    `SELECT ${ENTRY_COLUMNS} FROM glossary_entries WHERE ${where.join(' AND ')} ${order}
     LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
    args,
  )
  return NextResponse.json({ entries: rows.rows.map(entryFromRow), total, page, pageSize })
}

// POST /api/admin/glossary/[id]/entries — add an entry (409 `duplicate` if the same term already exists)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const { id } = await params
  const glossaryId = parseInt(id, 10)
  if (isNaN(glossaryId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const body = await req.json().catch(() => null)
  const parsed = entrySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const { source, target, matchVariants } = parsed.data
  const sourceLang = parsed.data.sourceLang || null
  const targetLang = parsed.data.targetLang || null

  const duplicate = await findDuplicateEntry(glossaryId, source, sourceLang, targetLang)
  if (duplicate) {
    return NextResponse.json({ error: 'This term already exists.', code: 'duplicate', existingTarget: duplicate.target }, { status: 409 })
  }

  const result = await query(
    `INSERT INTO glossary_entries (glossary_id, source_term, target_term, source_lang, target_lang, match_variants)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${ENTRY_COLUMNS}`,
    // Un terme ajouté accepte les variantes de fin de mot par défaut
    [glossaryId, source, target, sourceLang, targetLang, matchVariants !== false],
  )
  const created = entryFromRow(result.rows[0])
  await logAudit(session.user.id, session.user.email!, 'ADD_GLOSSARY_TERM', `glossary:${glossaryId}`, termDetail(created))
  return NextResponse.json(created)
}

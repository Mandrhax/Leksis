import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-guard'
import { logAudit } from '@/lib/audit'
import { importGlossaryRows } from '@/lib/glossary-entries'
import { parseGlossaryCsv, MAX_CSV_ROWS } from '@/lib/glossary-csv'
import { LANGUAGES } from '@/lib/languages'
import { requestTooLarge } from '@/lib/validators'

export const dynamic = 'force-dynamic'

const IMPORT_MAX_BYTES = 2 * 1024 * 1024
/** Lignes rejetées renvoyées à l'interface : le total est toujours donné, la liste est tronquée. */
const MAX_REPORTED_ISSUES = 50

// « FR-ch » → « fr-CH » ; null si la langue n'est pas proposée par Leksis
const LANG_BY_LOWER = new Map(LANGUAGES.map(l => [l.code.toLowerCase(), l.code]))
const resolveLang = (code: string) => LANG_BY_LOWER.get(code.toLowerCase()) ?? null

// POST /api/admin/glossary/[id]/import — bulk import from CSV, all or nothing (one transaction)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const { id } = await params
  const glossaryId = parseInt(id, 10)
  if (isNaN(glossaryId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  if (requestTooLarge(req, IMPORT_MAX_BYTES)) {
    return NextResponse.json({ error: 'File too large.', code: 'too_large' }, { status: 413 })
  }
  const text = await req.text()
  if (!text.trim()) return NextResponse.json({ error: 'Empty body', code: 'empty' }, { status: 400 })
  if (text.length > IMPORT_MAX_BYTES) {
    return NextResponse.json({ error: 'File too large.', code: 'too_large' }, { status: 413 })
  }

  const { rows, rejected } = parseGlossaryCsv(text, resolveLang)
  if (rows.length + rejected.length > MAX_CSV_ROWS) {
    return NextResponse.json({ error: 'Too many rows.', code: 'too_many_rows', max: MAX_CSV_ROWS }, { status: 400 })
  }

  let outcome
  try {
    outcome = await importGlossaryRows(glossaryId, rows)
  } catch (err) {
    console.error('[glossary/import] failed:', err)
    return NextResponse.json({ error: 'Import failed.' }, { status: 500 })
  }
  if (!outcome) return NextResponse.json({ error: 'Glossary not found.', code: 'not_found' }, { status: 404 })

  await logAudit(session.user.id, session.user.email!, 'IMPORT_GLOSSARY_CSV', `glossary:${glossaryId}`, {
    imported: outcome.imported, duplicates: outcome.duplicates, rejected: rejected.length,
  })

  return NextResponse.json({
    imported: outcome.imported,
    duplicates: outcome.duplicates,
    rejectedCount: rejected.length,
    rejected: rejected.slice(0, MAX_REPORTED_ISSUES),
  })
}

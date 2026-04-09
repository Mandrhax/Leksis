import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-guard'
import { query } from '@/lib/db'

interface UsageRow {
  id:          string
  user_email:  string
  feature:     string
  source_lang: string | null
  target_lang: string | null
  model:       string | null
  char_count:  number | null
  created_at:  string
}

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const from   = searchParams.get('from')   // ISO date string
  const to     = searchParams.get('to')
  const format = searchParams.get('format') // 'csv' | undefined

  const params: (string | null)[] = []
  const conditions: string[] = []

  if (from) { params.push(from); conditions.push(`created_at >= $${params.length}::timestamptz`) }
  if (to)   { params.push(to);   conditions.push(`created_at <= ($${params.length}::timestamptz + interval '1 day')`) }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const result = await query<UsageRow>(
    `SELECT id, user_email, feature, source_lang, target_lang, model, char_count, created_at
     FROM usage_log
     ${where}
     ORDER BY created_at DESC
     LIMIT 10000`,
    params
  )

  const rows = result.rows

  if (format === 'csv') {
    const header = 'date,utilisateur,feature,source_lang,target_lang,model,char_count'
    const lines = rows.map(r => [
      new Date(r.created_at).toISOString(),
      r.user_email,
      r.feature,
      r.source_lang ?? '',
      r.target_lang ?? '',
      r.model       ?? '',
      r.char_count  ?? '',
    ].join(','))
    const csv = [header, ...lines].join('\n')
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="leksis-usage.csv"',
      },
    })
  }

  // Résumé JSON pour le tableau
  const byFeature: Record<string, number> = {}
  const byLang: Record<string, number>    = {}
  const byModel: Record<string, number>   = {}

  for (const r of rows) {
    byFeature[r.feature] = (byFeature[r.feature] ?? 0) + 1
    if (r.target_lang) byLang[r.target_lang]   = (byLang[r.target_lang]   ?? 0) + 1
    if (r.model)       byModel[r.model]         = (byModel[r.model]        ?? 0) + 1
  }

  return NextResponse.json({ total: rows.length, byFeature, byLang, byModel, rows: rows.slice(0, 200) })
}

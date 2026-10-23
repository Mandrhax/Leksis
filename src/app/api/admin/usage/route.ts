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
  trigger_type:     string | null
  status:           string | null
  model_chars:      number | null
  latency_ms:       number | null
  request_group_id: string | null
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// Champ CSV entre guillemets. Une valeur qui commence par = + - @ (ou tab / retour chariot) serait lue comme
// une formule par Excel/LibreOffice — les emails sont saisis librement — on la préfixe donc d'une apostrophe.
function csvField(value: string | number | null | undefined): string {
  let s = String(value ?? '')
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return `"${s.replace(/"/g, '""')}"`
}

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const from   = searchParams.get('from')   // YYYY-MM-DD
  const to     = searchParams.get('to')
  const format = searchParams.get('format') // 'csv' | undefined
  const limit  = Math.min(500, Math.max(1, parseInt(searchParams.get('limit') ?? '100', 10))) || 100

  if ((from && !DATE_RE.test(from)) || (to && !DATE_RE.test(to))) {
    return NextResponse.json({ error: 'Invalid date (expected YYYY-MM-DD).' }, { status: 400 })
  }

  const params: string[] = []
  const conditions: string[] = []

  if (from) { params.push(from); conditions.push(`created_at >= $${params.length}::timestamptz`) }
  if (to)   { params.push(to);   conditions.push(`created_at <= ($${params.length}::timestamptz + interval '1 day')`) }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  if (format === 'csv') {
    const result = await query<UsageRow>(
      `SELECT id, user_email, feature, source_lang, target_lang, model, char_count, created_at,
              trigger_type, status, model_chars, latency_ms, request_group_id
       FROM usage_log
       ${where}
       ORDER BY created_at DESC
       LIMIT 10000`,
      params
    )
    // Colonnes de suivi ajoutées en fin de ligne : les scripts qui lisent les 7 premières restent valables
    const header = 'date,utilisateur,feature,source_lang,target_lang,model,char_count,trigger,status,model_chars,latency_ms,request_group_id'
    const lines = result.rows.map(r => [
      new Date(r.created_at).toISOString(),
      r.user_email,
      r.feature,
      r.source_lang,
      r.target_lang,
      r.model,
      r.char_count,
      r.trigger_type,
      r.status,
      r.model_chars,
      r.latency_ms,
      r.request_group_id,
    ].map(csvField).join(','))
    const csv = [header, ...lines].join('\n')
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="leksis-usage.csv"',
      },
    })
  }

  // Résumé JSON pour le tableau : agrégats calculés en SQL sur toute la période, pas sur un échantillon
  const groupBy = (col: 'feature' | 'target_lang' | 'model') =>
    query<{ key: string; cnt: number }>(
      `SELECT ${col} AS key, count(*)::int AS cnt
       FROM usage_log
       ${where}${where ? ' AND' : ' WHERE'} ${col} IS NOT NULL AND ${col} <> 'n/a'
       GROUP BY ${col}`,
      params
    )

  const [rowsRes, totalRes, featureRes, langRes, modelRes] = await Promise.all([
    query<UsageRow>(
      `SELECT id, user_email, feature, source_lang, target_lang, model, char_count, created_at
       FROM usage_log
       ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length + 1}`,
      [...params, limit]
    ),
    query<{ count: number }>(`SELECT count(*)::int AS count FROM usage_log ${where}`, params),
    groupBy('feature'),
    groupBy('target_lang'),
    groupBy('model'),
  ])

  const toRecord = (rows: { key: string; cnt: number }[]) =>
    Object.fromEntries(rows.map(r => [r.key, r.cnt])) as Record<string, number>

  return NextResponse.json({
    total:     totalRes.rows[0]?.count ?? 0,
    byFeature: toRecord(featureRes.rows),
    byLang:    toRecord(langRes.rows),
    byModel:   toRecord(modelRes.rows),
    rows:      rowsRes.rows,
  })
}

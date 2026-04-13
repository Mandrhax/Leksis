import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-guard'
import { query } from '@/lib/db'

export interface DbTableStat {
  tableName:  string
  rowCount:   number   // n_live_tup — autovacuum estimate, not an exact count
  sizePretty: string
  sizeBytes:  number
}

export interface DbMetricsResult {
  version:           string   // "PostgreSQL X.Y.Z"
  dbSizePretty:      string
  dbSizeBytes:       number
  serverStartedAt:   string   // ISO timestamp
  activeConnections: number
  idleConnections:   number
  totalConnections:  number
  maxConnections:    number
  tables:            DbTableStat[]
}

export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  try {
    const [statusRes, connStateRes, maxConnRes, tablesRes] = await Promise.all([
      query<{
        version:    string
        size_pretty: string
        size_bytes:  string
        started_at:  Date
      }>(`
        SELECT
          version()                                            AS version,
          pg_size_pretty(pg_database_size(current_database())) AS size_pretty,
          pg_database_size(current_database())                 AS size_bytes,
          pg_postmaster_start_time()                           AS started_at
      `),

      query<{ state: string | null; cnt: number }>(`
        SELECT state, count(*)::int AS cnt
        FROM pg_stat_activity
        GROUP BY state
      `),

      query<{ max: number }>(`
        SELECT setting::int AS max FROM pg_settings WHERE name = 'max_connections'
      `),

      query<{
        table_name:  string
        row_count:   string
        size_pretty: string
        size_bytes:  string
      }>(`
        SELECT
          relname                                           AS table_name,
          n_live_tup                                        AS row_count,
          pg_size_pretty(pg_total_relation_size(relid))     AS size_pretty,
          pg_total_relation_size(relid)                     AS size_bytes
        FROM pg_stat_user_tables
        WHERE relname IN (
          'users','sessions','accounts','otp_tokens',
          'verification_token','site_settings','audit_log','usage_log'
        )
        ORDER BY size_bytes DESC
      `),
    ])

    const statusRow = statusRes.rows[0]

    // Extract only "PostgreSQL X.Y.Z" from the full version string
    const version = statusRow.version.split(' on ')[0] ?? statusRow.version

    const connMap = new Map<string | null, number>()
    for (const row of connStateRes.rows) connMap.set(row.state, row.cnt)
    const activeConnections = connMap.get('active')  ?? 0
    const idleConnections   = connMap.get('idle')    ?? 0
    const totalConnections  = [...connMap.values()].reduce((a, b) => a + b, 0)
    const maxConnections    = maxConnRes.rows[0]?.max ?? 100

    const tables: DbTableStat[] = tablesRes.rows.map(r => ({
      tableName:  r.table_name,
      rowCount:   Number(r.row_count),
      sizePretty: r.size_pretty,
      sizeBytes:  Number(r.size_bytes),
    }))

    const result: DbMetricsResult = {
      version,
      dbSizePretty:    statusRow.size_pretty,
      dbSizeBytes:     Number(statusRow.size_bytes),
      serverStartedAt: statusRow.started_at.toISOString(),
      activeConnections,
      idleConnections,
      totalConnections,
      maxConnections,
      tables,
    }

    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: 'DB metrics unavailable' }, { status: 503 })
  }
}

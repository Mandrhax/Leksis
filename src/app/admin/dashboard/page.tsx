export const dynamic = 'force-dynamic'

import { requireAdmin } from '@/lib/admin-guard'
import { query }        from '@/lib/db'
import { getSetting }   from '@/lib/settings'
import { labelAuditResources } from '@/lib/audit'
import { AdminDashboard } from '@/components/admin/AdminDashboard'
import pkg from '../../../../package.json'

interface SystemStatus {
  lastBackupAt?: string
}

export default async function AdminDashboardPage() {
  await requireAdmin()

  const [usersRes, callsTodayRes, glossaryRes, auditRes, trendRes, featureRes, systemStatus] = await Promise.all([
    query<{ count: string }>('SELECT COUNT(*)::int AS count FROM users'),
    query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM usage_log WHERE created_at >= CURRENT_DATE`
    ),
    query<{ total: string }>(
      `SELECT COALESCE(SUM(entry_count),0)::int AS total
       FROM (
         SELECT COUNT(ge.id) AS entry_count
         FROM glossaries g
         LEFT JOIN glossary_entries ge ON ge.glossary_id = g.id
         GROUP BY g.id
       ) sub`
    ),
    query<{ action: string; resource: string; detail: unknown; user_email: string; created_at: string }>(
      `SELECT action, resource, detail, user_email, created_at
       FROM audit_log
       ORDER BY created_at DESC
       LIMIT 5`
    ),
    // Zero-filled daily counts for the last 7 days (today included)
    query<{ day: string; count: string }>(
      `SELECT to_char(d::date, 'YYYY-MM-DD') AS day, COALESCE(u.count, 0)::int AS count
       FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, INTERVAL '1 day') AS d
       LEFT JOIN (
         SELECT date_trunc('day', created_at) AS day, COUNT(*) AS count
         FROM usage_log
         WHERE created_at >= CURRENT_DATE - INTERVAL '6 days'
         GROUP BY day
       ) u ON u.day = d
       ORDER BY d`
    ),
    query<{ feature: string; count: string }>(
      `SELECT feature, COUNT(*)::int AS count
       FROM usage_log
       WHERE created_at >= CURRENT_DATE - INTERVAL '6 days'
       GROUP BY feature`
    ),
    getSetting<SystemStatus>('system_status'),
  ])

  const stats = {
    userCount:     parseInt(usersRes.rows[0]?.count ?? '0'),
    callsToday:    parseInt(callsTodayRes.rows[0]?.count ?? '0'),
    glossaryTerms: parseInt(glossaryRes.rows[0]?.total ?? '0'),
  }

  const trend = trendRes.rows.map(r => ({ day: r.day, count: parseInt(r.count) }))

  const featureCounts = { text: 0, document: 0, image: 0, rewrite: 0 }
  for (const row of featureRes.rows) {
    if (row.feature in featureCounts) {
      featureCounts[row.feature as keyof typeof featureCounts] = parseInt(row.count)
    }
  }

  return (
    <AdminDashboard
      stats={stats}
      recentActivity={(await labelAuditResources(auditRes.rows)).map(({ detail: _detail, ...row }) => row)}
      appVersion={pkg.version}
      trend={trend}
      featureCounts={featureCounts}
      lastBackupAt={systemStatus.lastBackupAt ?? null}
    />
  )
}

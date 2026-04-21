export const dynamic = 'force-dynamic'

import { requireAdmin } from '@/lib/admin-guard'
import { query }        from '@/lib/db'
import { AdminDashboard } from '@/components/admin/AdminDashboard'
import pkg from '../../../../package.json'

export default async function AdminDashboardPage() {
  await requireAdmin()

  const [usersRes, callsTodayRes, glossaryRes, auditRes] = await Promise.all([
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
    query<{ action: string; resource: string; user_email: string; created_at: string }>(
      `SELECT action, resource, user_email, created_at
       FROM audit_log
       ORDER BY created_at DESC
       LIMIT 5`
    ),
  ])

  const stats = {
    userCount:     parseInt(usersRes.rows[0]?.count ?? '0'),
    callsToday:    parseInt(callsTodayRes.rows[0]?.count ?? '0'),
    glossaryTerms: parseInt(glossaryRes.rows[0]?.total ?? '0'),
  }

  return (
    <AdminDashboard
      stats={stats}
      recentActivity={auditRes.rows}
      appVersion={pkg.version}
    />
  )
}

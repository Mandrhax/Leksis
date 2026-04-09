import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-guard'
import { query } from '@/lib/db'

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const page  = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const limit = 50
  const offset = (page - 1) * limit

  const result = await query<{
    id: string; user_email: string; action: string; resource: string
    detail: unknown; created_at: string
  }>(
    `SELECT id, user_email, action, resource, detail, created_at
     FROM audit_log
     ORDER BY created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  )

  const total = await query<{ count: string }>('SELECT COUNT(*) AS count FROM audit_log')

  return NextResponse.json({
    rows: result.rows,
    total: parseInt(total.rows[0]?.count ?? '0'),
    page,
    limit,
  })
}

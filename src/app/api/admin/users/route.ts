import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-guard'
import { query } from '@/lib/db'

export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  const result = await query<{ id: string; email: string; name: string | null; role: string; created_at: string }>(
    `SELECT id, email, name, role, created_at
     FROM users
     ORDER BY created_at DESC`
  )
  return NextResponse.json(result.rows)
}

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-guard'
import { query } from '@/lib/db'

export async function DELETE(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const before = searchParams.get('before') // ISO date string YYYY-MM-DD

  if (!before || !/^\d{4}-\d{2}-\d{2}$/.test(before)) {
    return NextResponse.json({ error: 'Paramètre "before" invalide (format attendu : YYYY-MM-DD)' }, { status: 400 })
  }

  const result = await query(
    `DELETE FROM usage_log WHERE created_at < $1::timestamptz`,
    [before]
  )

  return NextResponse.json({ deleted: result.rowCount ?? 0 })
}

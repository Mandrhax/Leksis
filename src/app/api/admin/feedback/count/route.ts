import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-guard'
import { countByStatus } from '@/lib/feedback'

// Pastille de la barre latérale admin : nombre de messages non lus
export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  try {
    const counts = await countByStatus()
    return NextResponse.json({ new: counts.new })
  } catch (err) {
    console.error('[GET /api/admin/feedback/count] ERROR:', err)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}

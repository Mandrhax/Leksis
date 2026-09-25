import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-guard'
import { listUsers } from '@/lib/users'

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const sp = req.nextUrl.searchParams
  try {
    const result = await listUsers({
      page:     parseInt(sp.get('page') ?? '1', 10),
      pageSize: parseInt(sp.get('pageSize') ?? '', 10),
      q:        sp.get('q') ?? '',
    })
    return NextResponse.json(result)
  } catch (err) {
    console.error('[GET /api/admin/users]', err)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}

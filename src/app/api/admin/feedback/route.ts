import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-guard'
import { listFeedback } from '@/lib/feedback'
import { FEEDBACK_CATEGORIES, FEEDBACK_STATUSES, type FeedbackCategory, type FeedbackStatus } from '@/lib/feedback-schema'

// Boîte de réception : ?status=open|all|new|in_progress|done|archived, ?category=…, ?page=
export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const sp = req.nextUrl.searchParams
  const statusParam = sp.get('status') ?? 'open'
  const status = statusParam === 'open' || statusParam === 'all' || (FEEDBACK_STATUSES as readonly string[]).includes(statusParam)
    ? (statusParam as FeedbackStatus | 'open' | 'all')
    : 'open'
  const categoryParam = sp.get('category') ?? ''
  const category = (FEEDBACK_CATEGORIES as readonly string[]).includes(categoryParam) ? (categoryParam as FeedbackCategory) : undefined
  const page = Math.max(1, parseInt(sp.get('page') ?? '1', 10) || 1)

  try {
    const result = await listFeedback({ status, category, page, pageSize: 25 })
    return NextResponse.json({ ...result, page, pageSize: 25 })
  } catch (err) {
    console.error('[GET /api/admin/feedback] ERROR:', err)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}

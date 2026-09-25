import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-guard'
import { getAiConfig, assertAiAllowed, fetchAiMetrics, aiErrorResponse } from '@/lib/llm'

export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  try {
    const cfg = await getAiConfig()
    await assertAiAllowed(cfg)
    return NextResponse.json(await fetchAiMetrics(cfg))
  } catch (err) {
    return aiErrorResponse(err) ?? NextResponse.json({ error: 'AI server unreachable' }, { status: 503 })
  }
}

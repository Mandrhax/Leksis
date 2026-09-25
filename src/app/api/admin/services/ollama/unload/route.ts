import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-guard'
import { getOllamaAdminBase, aiErrorResponse } from '@/lib/llm'

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const model: string | undefined = body?.model
  if (!model) return NextResponse.json({ error: 'Missing model' }, { status: 400 })

  let baseUrl: string
  try {
    baseUrl = await getOllamaAdminBase()
  } catch (err) {
    return aiErrorResponse(err) ?? NextResponse.json({ error: 'AI configuration error' }, { status: 500 })
  }

  try {
    const res = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: '', keep_alive: 0, stream: false }),
      signal: AbortSignal.timeout(10000),
    })

    return NextResponse.json({ ok: res.ok })
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 })
  }
}

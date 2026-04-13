import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-guard'
import { getOllamaConfig } from '@/lib/ollama'

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const model: string | undefined = body?.model
  if (!model) return NextResponse.json({ error: 'Missing model' }, { status: 400 })

  const { baseUrl } = await getOllamaConfig()

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

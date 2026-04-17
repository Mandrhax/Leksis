import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-guard'
import { getOllamaConfig } from '@/lib/ollama'
import { logAudit } from '@/lib/audit'

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const model: string | undefined = body?.model
  if (!model?.trim()) return NextResponse.json({ error: 'Missing model' }, { status: 400 })

  const { baseUrl } = await getOllamaConfig()

  let ollamaRes: Response
  try {
    ollamaRes = await fetch(`${baseUrl}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: model.trim(), stream: true }),
    })
  } catch {
    return NextResponse.json({ error: 'Ollama unreachable' }, { status: 503 })
  }

  if (!ollamaRes.ok || !ollamaRes.body) {
    return NextResponse.json({ error: 'Pull failed' }, { status: 502 })
  }

  const ollamaBody = ollamaRes.body
  const userId = session.user.id
  const userEmail = session.user.email!

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = ollamaBody.getReader()
      let success = false
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          controller.enqueue(value)
          const text = new TextDecoder().decode(value)
          for (const line of text.split('\n')) {
            if (!line.trim()) continue
            try {
              const parsed = JSON.parse(line)
              if (parsed.status === 'success') success = true
            } catch { /* ignore parse errors */ }
          }
        }
      } finally {
        controller.close()
        if (success) {
          logAudit(userId, userEmail, 'PULL_MODEL', 'service:ollama', { model })
        }
      }
    },
  })

  return new NextResponse(stream, {
    headers: { 'Content-Type': 'application/x-ndjson' },
  })
}

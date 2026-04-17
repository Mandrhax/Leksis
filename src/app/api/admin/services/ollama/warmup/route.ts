import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-guard'
import { getOllamaConfig } from '@/lib/ollama'

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const models: string[] = Array.isArray(body?.models)
    ? [...new Set((body.models as string[]).filter((m: string) => m?.trim()))]
    : []

  if (models.length === 0)
    return NextResponse.json({ error: 'No models provided' }, { status: 400 })

  const { baseUrl } = await getOllamaConfig()

  const loaded: string[] = []
  const errors: { model: string; error: string }[] = []

  for (const model of models) {
    try {
      const res = await fetch(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt: '', stream: false, keep_alive: -1 }),
        signal: AbortSignal.timeout(120_000),
      })
      if (res.ok) {
        loaded.push(model)
      } else {
        errors.push({ model, error: `HTTP ${res.status}` })
      }
    } catch (err) {
      errors.push({ model, error: err instanceof Error ? err.message : 'timeout' })
    }
  }

  return NextResponse.json({ loaded, errors })
}

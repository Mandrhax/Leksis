import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-guard'
import { getOllamaConfig } from '@/lib/ollama'
import { logAudit } from '@/lib/audit'

export async function DELETE(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const model: string | undefined = body?.model
  if (!model?.trim()) return NextResponse.json({ error: 'Missing model' }, { status: 400 })

  const { baseUrl } = await getOllamaConfig()

  try {
    const res = await fetch(`${baseUrl}/api/delete`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: model.trim() }),
      signal: AbortSignal.timeout(15000),
    })

    if (res.ok) {
      logAudit(session.user.id, session.user.email!, 'DELETE_MODEL', 'service:ollama', { model })
    }

    return NextResponse.json({ ok: res.ok })
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 })
  }
}

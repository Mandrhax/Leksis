import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminSession } from '@/lib/admin-guard'
import { logAudit } from '@/lib/audit'

const Schema = z.object({
  baseUrl:          z.string().url(),
  translationModel: z.string().min(1).optional(),
  rewriteModel:     z.string().min(1).optional(),
  ocrModel:         z.string().min(1).optional(),
  // backward-compat
  model:            z.string().min(1).optional(),
})

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const parsed = Schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { baseUrl, translationModel, model } = parsed.data
  // Modèle principal à vérifier : translationModel ou fallback sur model (legacy)
  const primaryModel = translationModel || model || ''
  const start = Date.now()

  try {
    const res = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    })

    if (!res.ok) {
      return NextResponse.json({ ok: false, message: `HTTP ${res.status}` })
    }

    const json = await res.json()
    const models: string[] = (json.models ?? []).map((m: { name: string }) => m.name)
    const latencyMs = Date.now() - start
    const modelFound = primaryModel ? models.includes(primaryModel) : null

    await logAudit(
      session.user.id, session.user.email!,
      'TEST_SERVICE', 'service:ollama',
      { ok: true, latencyMs, modelFound }
    )

    return NextResponse.json({
      ok: true,
      latencyMs,
      models,
      modelFound,
      message: !primaryModel
        ? `Connexion réussie — ${models.length} modèle(s) disponible(s)`
        : modelFound
          ? `Connexion réussie — modèle "${primaryModel}" disponible`
          : `Connexion réussie — modèle "${primaryModel}" introuvable dans la liste`,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue'
    await logAudit(session.user.id, session.user.email!, 'TEST_SERVICE', 'service:ollama', { ok: false, message })
    return NextResponse.json({ ok: false, message: `Connexion échouée : ${message}` })
  }
}

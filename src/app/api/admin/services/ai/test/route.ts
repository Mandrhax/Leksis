import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminSession } from '@/lib/admin-guard'
import { logAudit } from '@/lib/audit'
import { getAiConfig, createProvider, isExternalUrl, sameModelName } from '@/lib/llm'

const Schema = z.object({
  provider:         z.enum(['ollama', 'openai']),
  baseUrl:          z.string().url().refine(u => /^https?:\/\//i.test(u)),
  apiKey:           z.string().optional(),   // vide = clé enregistrée (si même serveur)
  allowExternal:    z.boolean().optional(),
  translationModel: z.string().optional(),
})

const trimSlash = (u: string) => u.replace(/\/+$/, '')

/**
 * Teste la configuration en cours d'édition (non enregistrée) :
 * liste les modèles du serveur et vérifie la présence du modèle de traduction.
 * Le texte des messages est construit côté client (i18n) à partir de `ok`, `code`, `modelFound`.
 */
export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const parsed = Schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const data = parsed.data

  const stored = await getAiConfig()
  // La clé enregistrée n'est jamais envoyée à un autre serveur que celui pour lequel elle a été saisie
  const sameTarget = stored.provider === data.provider && trimSlash(stored.baseUrl) === trimSlash(data.baseUrl)
  const cfg = {
    provider:      data.provider,
    baseUrl:       data.baseUrl,
    apiKey:        data.apiKey || (sameTarget ? stored.apiKey : ''),
    allowExternal: data.allowExternal ?? stored.allowExternal,
  }

  if (!cfg.allowExternal && await isExternalUrl(cfg.baseUrl)) {
    return NextResponse.json({ ok: false, code: 'external_blocked' })
  }

  const primary = data.translationModel?.trim() ?? ''
  const start = Date.now()
  try {
    const models = (await createProvider(cfg).listModels(AbortSignal.timeout(8000))).map(m => m.name)
    const latencyMs = Date.now() - start
    const modelFound = primary ? models.some(m => sameModelName(cfg.provider, m, primary)) : null

    await logAudit(session.user.id, session.user.email!, 'TEST_SERVICE', 'service:ai',
      { provider: cfg.provider, ok: true, latencyMs, modelFound })

    return NextResponse.json({ ok: true, latencyMs, models, modelFound })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    await logAudit(session.user.id, session.user.email!, 'TEST_SERVICE', 'service:ai',
      { provider: cfg.provider, ok: false, message })
    return NextResponse.json({ ok: false, message })
  }
}

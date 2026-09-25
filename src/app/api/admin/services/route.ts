import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminSession } from '@/lib/admin-guard'
import { updateSetting, getSetting } from '@/lib/settings'
import { encrypt } from '@/lib/crypto'
import { generateCaddyfile, normalizeCaddyConfig, reloadCaddy } from '@/lib/caddy'
import { getAiConfig, getAiPublicConfig, isExternalUrl } from '@/lib/llm'
import { NUM_CTX_MAX, NUM_CTX_MIN } from '@/lib/llm/types'

const AiSchema = z.object({
  service:          z.literal('ai'),
  provider:         z.enum(['ollama', 'openai']),
  baseUrl:          z.string().url().refine(u => /^https?:\/\//i.test(u)),
  apiKey:           z.string().optional(),      // vide = ne pas modifier
  clearApiKey:      z.boolean().optional(),
  translationModel: z.string().min(1),
  ocrModel:         z.string().min(1),
  rewriteModel:     z.string().min(1),
  sameModelForAll:  z.boolean().optional(),
  allowExternal:    z.boolean().optional(),
  numCtx:           z.number().int().min(NUM_CTX_MIN).max(NUM_CTX_MAX).optional(),  // Ollama : contexte en tokens
})

const CaddySchema = z.object({
  service:          z.literal('caddy'),
  mode:             z.enum(['http', 'https', 'proxy']),
  host:             z.string().optional(),       // nom de domaine (mode https)
  keepHttpFallback: z.boolean().optional(),
  trustedProxies:   z.string().optional(),       // mode proxy : adresses hors réseau privé
})

const Schema = z.discriminatedUnion('service', [AiSchema, CaddySchema])

export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const ai     = await getAiPublicConfig()
  const caddy  = await getSetting<Record<string, unknown>>('caddy_config')

  return NextResponse.json({ ai, caddy })
}

export async function PATCH(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const parsed = Schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const data = parsed.data

  if (data.service === 'ai') {
    const existing = await getSetting<Record<string, unknown>>('ai_config')
    const current  = await getAiConfig()
    const allowExternal = data.allowExternal ?? (existing.allowExternal === true)

    // Un serveur hors réseau privé reçoit les textes des utilisateurs : refusé sans autorisation explicite
    if (!allowExternal && await isExternalUrl(data.baseUrl)) {
      return NextResponse.json({ error: 'external_blocked' }, { status: 400 })
    }

    // La clé enregistrée ne suit pas un changement de serveur (elle ne doit pas partir vers une autre adresse)
    const trimSlash = (u: string) => u.replace(/\/+$/, '')
    const sameTarget = current.provider === data.provider && trimSlash(current.baseUrl) === trimSlash(data.baseUrl)
    const apiKeyEnc = data.clearApiKey
      ? ''
      : data.apiKey
        ? encrypt(data.apiKey)
        : (sameTarget ? ((existing.apiKeyEnc as string | undefined) ?? '') : '')

    const value = {
      provider:         data.provider,
      baseUrl:          data.baseUrl,
      apiKeyEnc,
      translationModel: data.translationModel,
      ocrModel:         data.ocrModel,
      rewriteModel:     data.sameModelForAll ? data.translationModel : data.rewriteModel,
      sameModelForAll:  data.sameModelForAll ?? false,
      allowExternal,
      numCtx:           data.numCtx ?? current.numCtx,
    }
    // Le journal d'audit ne reçoit jamais la clé, même chiffrée
    await updateSetting('ai_config', value, session.user.id, session.user.email!, {
      provider:         value.provider,
      baseUrl:          value.baseUrl,
      translationModel: value.translationModel,
      ocrModel:         value.ocrModel,
      rewriteModel:     value.rewriteModel,
      allowExternal,
      numCtx:           value.numCtx,
      hasApiKey:        apiKeyEnc !== '',
    })
  } else {
    const normalized = normalizeCaddyConfig(data)
    if ('error' in normalized) {
      return NextResponse.json({ error: normalized.error }, { status: 400 })
    }
    const config = normalized.config

    // behindProxy : conservé pour la compatibilité avec l'ancien format
    await updateSetting('caddy_config', {
      ...config,
      behindProxy: config.mode === 'proxy',
    }, session.user.id, session.user.email!)

    const content = generateCaddyfile(config)
    let reloadError: string | undefined
    try {
      await reloadCaddy(content)
    } catch (err) {
      reloadError = err instanceof Error ? err.message : 'unknown'
    }

    return NextResponse.json({ ok: true, reloaded: !reloadError, reloadError })
  }

  return NextResponse.json({ ok: true })
}

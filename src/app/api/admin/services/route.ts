import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminSession } from '@/lib/admin-guard'
import { updateSetting, getSetting } from '@/lib/settings'
import { encrypt } from '@/lib/crypto'
import { generateCaddyfile, normalizeCaddyConfig, reloadCaddy } from '@/lib/caddy'
import { getAiConfig, getAiPublicConfig, isExternalUrl } from '@/lib/llm'
import { NUM_CTX_MAX, NUM_CTX_MIN, MAX_CONCURRENT_AI_REQUESTS_MAX } from '@/lib/llm/types'
import { getSmtpConfig, getSmtpPublicConfig, isSmtpConfigured } from '@/lib/smtp'
import { isValidEmail } from '@/lib/validators'
import { AUTH_METHODS } from '@/lib/settings-schema'
import { getOidcConfig, getOidcPublicConfig, isOidcConfigured } from '@/lib/auth-methods'
import { parseAllowedDomains } from '@/lib/oidc-access'

const AiSchema = z.object({
  service:          z.literal('ai'),
  provider:         z.enum(['ollama', 'openai']),
  baseUrl:          z.string().url().refine(u => /^https?:\/\//i.test(u)),
  apiKey:           z.string().optional(),      // vide = ne pas modifier
  clearApiKey:      z.boolean().optional(),
  translationModel: z.string().min(1),
  ocrModel:         z.string().min(1),
  rewriteModel:     z.string().min(1),
  voiceModel:       z.string().optional(),  // dictée vocale — vide = désactivée, jamais requis
  sameModelForAll:  z.boolean().optional(),
  allowExternal:    z.boolean().optional(),
  numCtx:           z.number().int().min(NUM_CTX_MIN).max(NUM_CTX_MAX).optional(),  // Ollama : contexte en tokens
  maxConcurrentAiRequests: z.number().int().min(0).max(MAX_CONCURRENT_AI_REQUESTS_MAX).optional(),  // 0 = illimité
})

const CaddySchema = z.object({
  service:          z.literal('caddy'),
  mode:             z.enum(['http', 'https', 'proxy']),
  host:             z.string().optional(),       // nom de domaine (mode https)
  keepHttpFallback: z.boolean().optional(),
  trustedProxies:   z.string().optional(),       // mode proxy : adresses hors réseau privé
})

const SmtpSchema = z.object({
  service:         z.literal('smtp'),
  host:            z.string().max(255),
  port:            z.number().int().min(1).max(65535),
  secure:          z.boolean().optional(),
  user:            z.string().max(255).optional(),
  password:        z.string().max(500).optional(),  // vide = ne pas modifier
  clearPassword:   z.boolean().optional(),
  fromAddress:     z.string().max(254).refine(isValidEmail, 'Invalid email'),
  fromName:        z.string().max(120).optional(),
})

const AuthSchema = z.object({
  service: z.literal('auth'),
  method:  z.enum(AUTH_METHODS),
})

const OidcSchema = z.object({
  service:           z.literal('oidc'),
  issuer:            z.string().url(),
  clientId:          z.string().min(1).max(255),
  clientSecret:      z.string().max(2000).optional(),  // vide = ne pas modifier
  clearClientSecret: z.boolean().optional(),
  buttonLabel:       z.string().max(60).optional(),
  scopes:            z.string().max(500).optional(),
  allowedDomains:    z.string().max(500).optional(),
})

const Schema = z.discriminatedUnion('service', [AiSchema, CaddySchema, SmtpSchema, AuthSchema, OidcSchema])

export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const ai     = await getAiPublicConfig()
  const caddy  = await getSetting<Record<string, unknown>>('caddy_config')
  const smtp   = await getSmtpPublicConfig()
  const oidc   = await getOidcPublicConfig()

  return NextResponse.json({ ai, caddy, smtp, oidc })
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
      voiceModel:       data.voiceModel ?? current.voiceModel,
      sameModelForAll:  data.sameModelForAll ?? false,
      allowExternal,
      numCtx:           data.numCtx ?? current.numCtx,
      maxConcurrentAiRequests: data.maxConcurrentAiRequests ?? current.maxConcurrentAiRequests,
    }
    // Le journal d'audit ne reçoit jamais la clé, même chiffrée
    await updateSetting('ai_config', value, session.user.id, session.user.email!, {
      provider:         value.provider,
      baseUrl:          value.baseUrl,
      translationModel: value.translationModel,
      ocrModel:         value.ocrModel,
      rewriteModel:     value.rewriteModel,
      voiceModel:       value.voiceModel,
      allowExternal,
      numCtx:           value.numCtx,
      maxConcurrentAiRequests: value.maxConcurrentAiRequests,
      hasApiKey:        apiKeyEnc !== '',
    })
  } else if (data.service === 'smtp') {
    const existing = await getSetting<Record<string, unknown>>('smtp_config')
    const passEnc = data.clearPassword
      ? ''
      : data.password
        ? encrypt(data.password)
        : ((existing.passEnc as string | undefined) ?? '')

    const value = {
      host:        data.host,
      port:        data.port,
      secure:      data.secure ?? false,
      user:        data.user ?? '',
      passEnc,
      fromAddress: data.fromAddress,
      fromName:    data.fromName ?? '',
    }
    // Le journal d'audit ne reçoit jamais le mot de passe, même chiffré
    await updateSetting('smtp_config', value, session.user.id, session.user.email!, {
      host: value.host, port: value.port, secure: value.secure, user: value.user,
      fromAddress: value.fromAddress, fromName: value.fromName, hasPassword: passEnc !== '',
    })
  } else if (data.service === 'auth') {
    // Vérifications croisées qu'un simple schéma zod ne peut pas faire : basculer sur une méthode qui a
    // besoin de SMTP/OIDC sans que ce soit configuré verrouillerait l'instance (plus personne ne pourrait
    // se connecter) — refusé ici plutôt que découvert après coup. C'est pour ça que ce réglage ne passe
    // jamais par le PATCH générique /api/admin/settings (voir src/lib/settings-schema.ts).
    if (data.method === 'otp_email' || data.method === 'password_email_verify') {
      if (!isSmtpConfigured(await getSmtpConfig())) {
        return NextResponse.json({ error: 'smtp_not_configured' }, { status: 400 })
      }
    }
    if (data.method === 'sso_oidc') {
      if (!isOidcConfigured(await getOidcConfig())) {
        return NextResponse.json({ error: 'oidc_not_configured' }, { status: 400 })
      }
    }
    await updateSetting('auth_config', { method: data.method }, session.user.id, session.user.email!)
  } else if (data.service === 'oidc') {
    const existing = await getSetting<Record<string, unknown>>('oidc_config')
    const issuer = data.issuer.replace(/\/+$/, '')
    // Le secret enregistré ne suit pas un changement d'issuer/clientId, même logique que ai_config.apiKeyEnc
    const sameTarget = (existing.issuer as string | undefined) === issuer && (existing.clientId as string | undefined) === data.clientId
    const clientSecretEnc = data.clearClientSecret
      ? ''
      : data.clientSecret
        ? encrypt(data.clientSecret)
        : (sameTarget ? ((existing.clientSecretEnc as string | undefined) ?? '') : '')

    const value = {
      issuer,
      clientId:    data.clientId,
      clientSecretEnc,
      buttonLabel: data.buttonLabel || 'SSO',
      scopes:      data.scopes || 'openid email profile',
      allowedDomains: parseAllowedDomains(data.allowedDomains ?? '').join(', '),
    }
    // Le journal d'audit ne reçoit jamais le secret, même chiffré
    await updateSetting('oidc_config', value, session.user.id, session.user.email!, {
      issuer: value.issuer, clientId: value.clientId, buttonLabel: value.buttonLabel, scopes: value.scopes,
      allowedDomains: value.allowedDomains,
      hasClientSecret: clientSecretEnc !== '',
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

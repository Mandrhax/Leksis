import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminSession } from '@/lib/admin-guard'
import { updateSetting, getSetting } from '@/lib/settings'
import { encrypt } from '@/lib/crypto'
import { generateCaddyfile, reloadCaddy } from '@/lib/caddy'

const OllamaSchema = z.object({
  service:          z.literal('ollama'),
  baseUrl:          z.string().url(),
  translationModel: z.string().min(1),
  ocrModel:         z.string().min(1),
  rewriteModel:     z.string().min(1),
  sameModelForAll:  z.boolean().optional(),
  // backward-compat: ancienne clé "model"
  model:            z.string().optional(),
})

const DbSchema = z.object({
  service:  z.literal('db'),
  host:     z.string().min(1),
  port:     z.number().int().min(1).max(65535),
  database: z.string().min(1),
  user:     z.string().min(1),
  password: z.string().optional(), // vide = ne pas modifier
})

const CaddySchema = z.object({
  service:     z.literal('caddy'),
  host:        z.string().min(1),
  behindProxy: z.boolean(),
})

const Schema = z.discriminatedUnion('service', [OllamaSchema, DbSchema, CaddySchema])

export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  const ollama = await getSetting<Record<string, unknown>>('ollama_config')
  const db     = await getSetting<Record<string, unknown>>('db_config')

  // Ne jamais renvoyer le passwordEnc
  const safeDb = { ...db }
  delete safeDb.passwordEnc

  return NextResponse.json({ ollama, db: safeDb })
}

export async function PATCH(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const parsed = Schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const data = parsed.data

  if (data.service === 'ollama') {
    await updateSetting('ollama_config', {
      baseUrl:          data.baseUrl,
      translationModel: data.translationModel,
      ocrModel:         data.ocrModel,
      rewriteModel:     data.rewriteModel,
      sameModelForAll:  data.sameModelForAll ?? false,
    }, session.user.id, session.user.email!)
  } else if (data.service === 'db') {
    const existing = await getSetting<Record<string, unknown>>('db_config')
    const passwordEnc = data.password
      ? encrypt(data.password)
      : (existing.passwordEnc as string ?? '')

    await updateSetting('db_config', {
      host: data.host, port: data.port, database: data.database,
      user: data.user, passwordEnc,
    }, session.user.id, session.user.email!)
  } else {
    await updateSetting('caddy_config', {
      host: data.host,
      behindProxy: data.behindProxy,
    }, session.user.id, session.user.email!)

    const content = generateCaddyfile({ host: data.host, behindProxy: data.behindProxy })
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

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminSession } from '@/lib/admin-guard'
import { getAllSettings, updateSetting } from '@/lib/settings'

export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  const settings = await getAllSettings()
  // Ne jamais renvoyer le passwordEnc en clair
  if (settings.db_config && typeof settings.db_config === 'object') {
    const db = { ...(settings.db_config as Record<string, unknown>) }
    delete db.passwordEnc
    settings.db_config = db
  }
  return NextResponse.json(settings)
}

const ToneConfigSchema = z.object({
  id:          z.string().min(1),
  labels:      z.object({
    en: z.string().min(1),
    fr: z.string().optional(),
    de: z.string().optional(),
  }),
  instruction: z.string().min(1),
  enabled:     z.boolean().optional(),
})

const PatchSchema = z.union([
  z.object({
    key:   z.enum(['branding', 'design', 'general', 'seo', 'features']),
    value: z.record(z.string(), z.unknown()),
  }),
  z.object({
    key:   z.literal('rewrite_tones'),
    value: z.array(ToneConfigSchema).min(1).max(6),
  }),
])

export async function PATCH(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const parsed = PatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { key, value } = parsed.data
  await updateSetting(key, value as object, session.user.id, session.user.email!)
  return NextResponse.json({ ok: true })
}

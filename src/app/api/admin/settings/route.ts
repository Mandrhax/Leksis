import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminSession } from '@/lib/admin-guard'
import { getAllSettings, updateSetting } from '@/lib/settings'
import { isValidatedSettingKey, parseSetting } from '@/lib/settings-schema'

export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  const settings = await getAllSettings()
  // Ancien réglage « connexion PostgreSQL » (supprimé, jamais utilisé) : ne jamais l'exposer, même chiffré
  delete settings.db_config
  // La clé API chiffrée du serveur IA ne quitte jamais le serveur (le navigateur reçoit seulement hasApiKey via /services)
  if (settings.ai_config && typeof settings.ai_config === 'object') {
    const { apiKeyEnc: _apiKeyEnc, ...ai } = settings.ai_config as Record<string, unknown>
    settings.ai_config = ai
  }
  return NextResponse.json(settings)
}

const PatchSchema = z.object({
  key:   z.string().refine(isValidatedSettingKey, 'Unknown setting'),
  value: z.unknown(),
})

export async function PATCH(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const parsed = PatchSchema.safeParse(body)
  if (!parsed.success || !isValidatedSettingKey(parsed.data.key)) {
    return NextResponse.json({ error: 'Unknown setting.' }, { status: 400 })
  }

  const { key } = parsed.data
  const checked = parseSetting(key, parsed.data.value)
  if (!checked.ok) {
    return NextResponse.json({ error: 'Invalid value.', details: checked.error.flatten() }, { status: 400 })
  }

  await updateSetting(key, checked.value, session.user.id, session.user.email!)
  return NextResponse.json({ ok: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession }           from '@/lib/admin-guard'
import { updateSetting, getSetting } from '@/lib/settings'
import { logAudit }                  from '@/lib/audit'

const ALLOWED_KEYS = [
  'branding',
  'design',
  'features',
  'rewrite_tones',
  'general',
  'seo',
  'ollama_config',
  'db_config',
] as const

type AllowedKey = typeof ALLOWED_KEYS[number]

function isAllowedKey(k: string): k is AllowedKey {
  return (ALLOWED_KEYS as readonly string[]).includes(k)
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  const body = await req.json().catch(() => null)

  if (!body || typeof body !== 'object' || !body.version || !body.settings || typeof body.settings !== 'object') {
    return NextResponse.json({ error: 'Fichier de backup invalide.' }, { status: 400 })
  }

  const incoming = body.settings as Record<string, unknown>
  const imported: string[] = []

  for (const key of Object.keys(incoming)) {
    if (!isAllowedKey(key)) continue

    const value = incoming[key]
    if (value === null || typeof value !== 'object') continue

    if (key === 'rewrite_tones') {
      if (!Array.isArray(value) || value.length < 1 || value.length > 6) continue
    }

    if (key === 'db_config') {
      // Ne jamais importer passwordEnc — préserver l'existant en base
      const existing = await getSetting<Record<string, unknown>>('db_config')
      const safeValue = { ...(value as Record<string, unknown>) }
      delete safeValue.passwordEnc
      const merged = { ...safeValue, passwordEnc: existing.passwordEnc ?? '' }
      await updateSetting('db_config', merged, session.user.id, session.user.email!)
      imported.push(key)
      continue
    }

    await updateSetting(key, value as object, session.user.id, session.user.email!)
    imported.push(key)
  }

  await logAudit(
    session.user.id,
    session.user.email!,
    'IMPORT_SETTINGS',
    'settings:all',
    { imported }
  )

  return NextResponse.json({ ok: true, imported })
}

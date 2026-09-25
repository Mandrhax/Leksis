import { NextResponse } from 'next/server'
import { unlink } from 'node:fs/promises'
import { getAdminSession } from '@/lib/admin-guard'
import { getSetting, updateSetting } from '@/lib/settings'
import { DEFAULT_TONES } from '@/lib/tones'
import { assetPathFromUrl } from '@/lib/site-assets'
import { SETTING_DEFAULTS } from '@/lib/settings-schema'

const DEFAULTS = { ...SETTING_DEFAULTS, rewrite_tones: DEFAULT_TONES }

export async function POST() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  // Supprimer les fichiers logo et background s'ils existent
  try {
    const branding = await getSetting<{ logoUrl?: string; backgroundImage?: string }>('branding')
    for (const url of [branding?.logoUrl, branding?.backgroundImage]) {
      const path = url ? assetPathFromUrl(url) : null
      if (path) await unlink(path).catch(() => {})
    }
  } catch {}

  for (const [key, value] of Object.entries(DEFAULTS)) {
    await updateSetting(key, value, session.user.id, session.user.email!)
  }

  return NextResponse.json({ ok: true })
}

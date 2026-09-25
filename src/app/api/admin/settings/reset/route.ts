import { NextResponse } from 'next/server'
import { unlink } from 'node:fs/promises'
import { getAdminSession } from '@/lib/admin-guard'
import { getSetting, updateSetting } from '@/lib/settings'
import { DEFAULT_TONES } from '@/lib/tones'
import { assetPathFromUrl } from '@/lib/site-assets'

const DEFAULTS = {
  branding:      { siteName: 'Leksis', primaryColor: '#565e74', secondaryColor: '#506076', headerLogoSize: '32' },
  design:        { buttonRadius: '0.75rem', footerText: '© Leksis', footerLinks: [] },
  general:       { contactEmail: '', globalBanner: '', maintenanceMode: false, maintenanceMessage: '' },
  seo:           { title: 'Leksis', description: '' },
  features: {
    tabs:     { text: true, document: true, image: true, rewrite: true },
    defaults: { sourceLang: 'auto', targetLang: 'en', formality: 'Informal' },
    limits:   { maxTextChars: 5000, maxDocChars: 12000, maxImageMB: 10, rateLimitPerMin: 30 },
  },
  rewrite_tones: DEFAULT_TONES,
}

export async function POST() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

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

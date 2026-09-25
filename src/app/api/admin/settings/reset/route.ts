import { NextResponse } from 'next/server'
import { unlink } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { getAdminSession } from '@/lib/admin-guard'
import { getSetting, updateSetting } from '@/lib/settings'
import { DEFAULT_TONES } from '@/lib/tones'

const DEFAULTS = {
  branding:      { siteName: 'Leksis', primaryColor: '#565e74', secondaryColor: '#506076', darkMode: false, headerLogoSize: '32' },
  design:        { buttonRadius: '0.75rem', footerText: '© Leksis', footerLinks: [] },
  general:       { contactEmail: '', globalBanner: '', maintenanceMode: false, maintenanceMessage: '' },
  seo:           { title: 'Leksis', description: '' },
  features: {
    tabs:     { text: true, document: true, image: true, rewrite: true },
    defaults: { sourceLang: 'auto', targetLang: 'en', formality: 'Informal' },
    limits:   { maxTextChars: 5000, maxDocChars: 12000, maxImageMB: 10 },
  },
  rewrite_tones: DEFAULT_TONES,
}

export async function POST() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  // Supprimer les fichiers logo et background s'ils existent
  try {
    const branding = await getSetting<{ logoUrl?: string; backgroundImage?: string }>('branding')
    const uploadsDir = process.env.UPLOAD_DIR || '/tmp/uploads'
    for (const url of [branding?.logoUrl, branding?.backgroundImage]) {
      if (!url) continue
      // L'URL stockée porte un ?v=<timestamp> : il faut l'ôter, et ne garder que le nom de fichier
      const path      = url.split('?')[0]
      const newFormat = path.match(/^\/api\/site-assets\/(.+)$/)
      const filePath  = newFormat
        ? join(uploadsDir, basename(newFormat[1]))
        : join(process.cwd(), 'public', basename(path))
      await unlink(filePath).catch(() => {})
    }
  } catch {}

  for (const [key, value] of Object.entries(DEFAULTS)) {
    await updateSetting(key, value, session.user.id, session.user.email!)
  }

  return NextResponse.json({ ok: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { writeFile, unlink, mkdir } from 'node:fs/promises'
import { join, basename }           from 'node:path'
import { getAdminSession }          from '@/lib/admin-guard'
import { getSetting, updateSetting } from '@/lib/settings'

const ALLOWED_TYPES: Record<string, string> = {
  'image/png':     'png',
  'image/jpeg':    'jpg',
  'image/svg+xml': 'svg',
  'image/webp':    'webp',
  'image/x-icon':  'ico',
}
const MAX_SIZE   = 2 * 1024 * 1024 // 2 Mo
const ASSET_SLUG = 'site-logo'

function uploadsDir(): string {
  return process.env.UPLOAD_DIR || '/tmp/uploads'
}

/** Retourne le chemin disque d'une URL d'asset (ancienne ou nouvelle convention). */
function urlToPath(url: string): string {
  const newFormat = url.match(/^\/api\/site-assets\/(.+)$/)
  if (newFormat) return join(uploadsDir(), basename(newFormat[1]))
  // Ancienne convention : /site-logo.png dans public/
  return join(process.cwd(), 'public', basename(url))
}

async function removeExistingLogoFile() {
  try {
    const branding = await getSetting<{ logoUrl?: string }>('branding')
    if (branding?.logoUrl) await unlink(urlToPath(branding.logoUrl)).catch(() => {})
  } catch {}
}

export async function POST(req: NextRequest) {
  try {
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

    const formData = await req.formData()
    const file = formData.get('logo') as File | null
    if (!file) return NextResponse.json({ error: 'Aucun fichier.' }, { status: 400 })

    const ext = ALLOWED_TYPES[file.type]
    if (!ext) {
      return NextResponse.json(
        { error: 'Format non supporté. Utilisez PNG, JPG, SVG, WebP ou ICO.' },
        { status: 400 },
      )
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'Fichier trop volumineux (max 2 Mo).' }, { status: 400 })
    }

    await removeExistingLogoFile()

    const dir      = uploadsDir()
    const filename = `${ASSET_SLUG}.${ext}`
    const dest     = join(dir, filename)
    await mkdir(dir, { recursive: true })
    await writeFile(dest, Buffer.from(await file.arrayBuffer()))
    console.log('[logo] Fichier écrit :', dest)

    const logoUrl = `/api/site-assets/${filename}`
    const branding = (await getSetting<Record<string, unknown>>('branding')) ?? {}
    await updateSetting('branding', { ...branding, logoUrl }, session.user.id, session.user.email!)

    return NextResponse.json({ ok: true, logoUrl })
  } catch (err) {
    console.error('[POST /api/admin/logo] ERROR:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

    await removeExistingLogoFile()

    const branding = (await getSetting<Record<string, unknown>>('branding')) ?? {}
    const { logoUrl: _removed, ...rest } = branding
    await updateSetting('branding', rest, session.user.id, session.user.email!)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[DELETE /api/admin/logo]', err)
    return NextResponse.json({ error: 'Erreur interne du serveur.' }, { status: 500 })
  }
}

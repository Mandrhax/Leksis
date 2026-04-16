import { NextRequest, NextResponse } from 'next/server'
import { writeFile, unlink, mkdir } from 'node:fs/promises'
import { join, basename }           from 'node:path'
import { getAdminSession }          from '@/lib/admin-guard'
import { getSetting, updateSetting } from '@/lib/settings'

const ALLOWED_TYPES: Record<string, string> = {
  'image/png':     'png',
  'image/jpeg':    'jpg',
  'image/webp':    'webp',
  'image/svg+xml': 'svg',
}
const MAX_SIZE   = 5 * 1024 * 1024 // 5 Mo
const ASSET_SLUG = 'site-bg'

function uploadsDir(): string {
  return process.env.UPLOAD_DIR || '/tmp/uploads'
}

function urlToPath(url: string): string {
  const withoutQuery = url.split('?')[0]
  const newFormat = withoutQuery.match(/^\/api\/site-assets\/(.+)$/)
  if (newFormat) return join(uploadsDir(), basename(newFormat[1]))
  return join(process.cwd(), 'public', basename(withoutQuery))
}

async function removeExistingBgFile() {
  try {
    const branding = await getSetting<{ backgroundImage?: string }>('branding')
    if (branding?.backgroundImage) await unlink(urlToPath(branding.backgroundImage)).catch(() => {})
  } catch {}
}

export async function POST(req: NextRequest) {
  try {
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

    const formData = await req.formData()
    const file = formData.get('background') as File | null
    if (!file) return NextResponse.json({ error: 'Aucun fichier.' }, { status: 400 })

    const ext = ALLOWED_TYPES[file.type]
    if (!ext) {
      return NextResponse.json(
        { error: 'Format non supporté. Utilisez PNG, JPG, WebP ou SVG.' },
        { status: 400 },
      )
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'Fichier trop volumineux (max 5 Mo).' }, { status: 400 })
    }

    await removeExistingBgFile()

    const dir      = uploadsDir()
    const filename = `${ASSET_SLUG}.${ext}`
    const dest     = join(dir, filename)
    await mkdir(dir, { recursive: true })
    await writeFile(dest, Buffer.from(await file.arrayBuffer()))
    console.log('[background] Fichier écrit :', dest)

    const backgroundImage = `/api/site-assets/${filename}?v=${Date.now()}`
    const branding = (await getSetting<Record<string, unknown>>('branding')) ?? {}
    await updateSetting('branding', { ...branding, backgroundImage }, session.user.id, session.user.email!)

    return NextResponse.json({ ok: true, backgroundImage })
  } catch (err) {
    console.error('[POST /api/admin/background]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

    await removeExistingBgFile()

    const branding = (await getSetting<Record<string, unknown>>('branding')) ?? {}
    const { backgroundImage: _removed, ...rest } = branding
    await updateSetting('branding', rest, session.user.id, session.user.email!)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[DELETE /api/admin/background]', err)
    return NextResponse.json({ error: 'Erreur interne du serveur.' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { writeFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { getAdminSession } from '@/lib/admin-guard'
import { getSetting, updateSetting } from '@/lib/settings'

const ALLOWED_TYPES: Record<string, string> = {
  'image/png':  'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
}
const MAX_SIZE = 5 * 1024 * 1024 // 5 Mo

async function removeExistingBgFile() {
  try {
    const branding = await getSetting<{ backgroundImage?: string }>('branding')
    if (branding?.backgroundImage) {
      const relative = branding.backgroundImage.replace(/^\//, '')
      await unlink(join(process.cwd(), 'public', relative)).catch(() => {})
    }
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

    const filename = `site-bg.${ext}`
    const destPath = join(process.cwd(), 'public', filename)
    await writeFile(destPath, Buffer.from(await file.arrayBuffer()))

    const branding = (await getSetting<Record<string, unknown>>('branding')) ?? {}
    await updateSetting(
      'branding',
      { ...branding, backgroundImage: `/${filename}` },
      session.user.id,
      session.user.email!,
    )

    return NextResponse.json({ ok: true, backgroundImage: `/${filename}` })
  } catch (err) {
    console.error('[POST /api/admin/background]', err)
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
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
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

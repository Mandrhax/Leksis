import { NextRequest, NextResponse } from 'next/server'
import { writeFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { getAdminSession } from '@/lib/admin-guard'
import { getSetting, updateSetting } from '@/lib/settings'

const ALLOWED_TYPES: Record<string, string> = {
  'image/png':     'png',
  'image/jpeg':    'jpg',
  'image/svg+xml': 'svg',
  'image/webp':    'webp',
  'image/x-icon':  'ico',
}
const MAX_SIZE = 2 * 1024 * 1024 // 2 Mo

/** Supprime le fichier logo existant depuis le disque (silencieux si absent). */
async function removeExistingLogoFile() {
  try {
    const branding = await getSetting<{ logoUrl?: string }>('branding')
    if (branding?.logoUrl) {
      // Supprimer le slash initial pour que path.join fonctionne correctement
      const relative = branding.logoUrl.replace(/^\//, '')
      const oldPath  = join(process.cwd(), 'public', relative)
      await unlink(oldPath).catch(() => {})
    }
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

    const filename = `site-logo.${ext}`
    const destPath = join(process.cwd(), 'public', filename)
    const buffer   = Buffer.from(await file.arrayBuffer())
    await writeFile(destPath, buffer)

    const branding = (await getSetting<Record<string, unknown>>('branding')) ?? {}
    await updateSetting(
      'branding',
      { ...branding, logoUrl: `/${filename}` },
      session.user.id,
      session.user.email!,
    )

    return NextResponse.json({ ok: true, logoUrl: `/${filename}` })
  } catch (err) {
    console.error('[POST /api/admin/logo] ERROR:', err)
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
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

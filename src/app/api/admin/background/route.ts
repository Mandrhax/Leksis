import { NextRequest, NextResponse } from 'next/server'
import { unlink }                       from 'node:fs/promises'
import { getAdminSession }              from '@/lib/admin-guard'
import { getSetting, updateSetting }    from '@/lib/settings'
import { requestTooLarge }              from '@/lib/validators'
import { BACKGROUND, checkAsset, saveAsset, assetPathFromUrl } from '@/lib/site-assets'

async function removeCurrentBackgroundFile() {
  try {
    const branding = await getSetting<{ backgroundImage?: string }>('branding')
    const path = branding?.backgroundImage ? assetPathFromUrl(branding.backgroundImage) : null
    if (path) await unlink(path).catch(() => {})
  } catch {}
}

export async function POST(req: NextRequest) {
  try {
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

    if (requestTooLarge(req, BACKGROUND.maxBytes)) {
      return NextResponse.json({ error: 'File too large (max 5 MB).' }, { status: 413 })
    }

    const formData = await req.formData()
    const file = formData.get('background') as File | null
    if (!file) return NextResponse.json({ error: 'No file.' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const check = checkAsset(BACKGROUND, buffer)
    if (!check.ok) {
      return NextResponse.json(
        { error: check.error === 'too_large' ? 'File too large (max 5 MB).' : 'Unsupported format. Use PNG, JPG or WebP.' },
        { status: check.error === 'too_large' ? 413 : 400 },
      )
    }

    const backgroundImage = await saveAsset(BACKGROUND, buffer, check.format)
    const branding = (await getSetting<Record<string, unknown>>('branding')) ?? {}
    await updateSetting('branding', { ...branding, backgroundImage }, session.user.id, session.user.email!)

    return NextResponse.json({ ok: true, backgroundImage })
  } catch (err) {
    console.error('[POST /api/admin/background]', err)
    return NextResponse.json({ error: 'Erreur interne du serveur.' }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

    await removeCurrentBackgroundFile()

    const branding = (await getSetting<Record<string, unknown>>('branding')) ?? {}
    const { backgroundImage: _removed, ...rest } = branding
    await updateSetting('branding', rest, session.user.id, session.user.email!)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[DELETE /api/admin/background]', err)
    return NextResponse.json({ error: 'Erreur interne du serveur.' }, { status: 500 })
  }
}

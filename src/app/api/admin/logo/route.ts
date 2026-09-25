import { NextRequest, NextResponse } from 'next/server'
import { unlink }                       from 'node:fs/promises'
import { getAdminSession }              from '@/lib/admin-guard'
import { getSetting, updateSetting }    from '@/lib/settings'
import { requestTooLarge }              from '@/lib/validators'
import { LOGO, checkAsset, saveAsset, assetPathFromUrl } from '@/lib/site-assets'

async function removeCurrentLogoFile() {
  try {
    const branding = await getSetting<{ logoUrl?: string }>('branding')
    const path = branding?.logoUrl ? assetPathFromUrl(branding.logoUrl) : null
    if (path) await unlink(path).catch(() => {})
  } catch {}
}

export async function POST(req: NextRequest) {
  try {
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

    if (requestTooLarge(req, LOGO.maxBytes)) {
      return NextResponse.json({ error: 'File too large (max 2 MB).' }, { status: 413 })
    }

    const formData = await req.formData()
    const file = formData.get('logo') as File | null
    if (!file) return NextResponse.json({ error: 'No file.' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const check = checkAsset(LOGO, buffer)
    if (!check.ok) {
      return NextResponse.json(
        { error: check.error === 'too_large' ? 'File too large (max 2 MB).' : 'Unsupported format. Use PNG, JPG, WebP or ICO.' },
        { status: check.error === 'too_large' ? 413 : 400 },
      )
    }

    const logoUrl = await saveAsset(LOGO, buffer, check.format)
    const branding = (await getSetting<Record<string, unknown>>('branding')) ?? {}
    await updateSetting('branding', { ...branding, logoUrl }, session.user.id, session.user.email!)

    return NextResponse.json({ ok: true, logoUrl })
  } catch (err) {
    console.error('[POST /api/admin/logo] ERROR:', err)
    return NextResponse.json({ error: 'Erreur interne du serveur.' }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

    await removeCurrentLogoFile()

    const branding = (await getSetting<Record<string, unknown>>('branding')) ?? {}
    const { logoUrl: _removed, ...rest } = branding
    await updateSetting('branding', rest, session.user.id, session.user.email!)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[DELETE /api/admin/logo]', err)
    return NextResponse.json({ error: 'Erreur interne du serveur.' }, { status: 500 })
  }
}

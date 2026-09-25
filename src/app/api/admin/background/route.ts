import { NextRequest, NextResponse } from 'next/server'
import { unlink }                       from 'node:fs/promises'
import { getAdminSession }              from '@/lib/admin-guard'
import { getSetting, updateSetting }    from '@/lib/settings'
import { requestTooLarge }              from '@/lib/validators'
import { BACKGROUND, checkAsset, saveAsset, assetPathFromUrl, tooLarge, unsupportedFormat } from '@/lib/site-assets'

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
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

    if (requestTooLarge(req, BACKGROUND.maxBytes)) {
      return NextResponse.json(tooLarge(BACKGROUND), { status: 413 })
    }

    const formData = await req.formData()
    const file = formData.get('background') as File | null
    if (!file) return NextResponse.json({ error: 'No file.', code: 'no_file' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const check = checkAsset(BACKGROUND, buffer)
    if (!check.ok) {
      return check.error === 'too_large'
        ? NextResponse.json(tooLarge(BACKGROUND), { status: 413 })
        : NextResponse.json(unsupportedFormat(BACKGROUND), { status: 400 })
    }

    const backgroundImage = await saveAsset(BACKGROUND, buffer, check.format)
    const branding = (await getSetting<Record<string, unknown>>('branding')) ?? {}
    await updateSetting('branding', { ...branding, backgroundImage }, session.user.id, session.user.email!)

    return NextResponse.json({ ok: true, backgroundImage })
  } catch (err) {
    console.error('[POST /api/admin/background]', err)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

    await removeCurrentBackgroundFile()

    const branding = (await getSetting<Record<string, unknown>>('branding')) ?? {}
    const { backgroundImage: _removed, ...rest } = branding
    await updateSetting('branding', rest, session.user.id, session.user.email!)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[DELETE /api/admin/background]', err)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}

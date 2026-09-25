import { NextResponse }    from 'next/server'
import { readFile }        from 'node:fs/promises'
import { basename }        from 'node:path'
import { assetPathFromUrl } from '@/lib/site-assets'
import { getAdminSession } from '@/lib/admin-guard'
import { getAllSettings }  from '@/lib/settings'
import { logAudit }        from '@/lib/audit'
import { query }           from '@/lib/db'

const CONTENT_TYPES: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', ico: 'image/x-icon',
}

// Reads an uploaded logo/background referenced by a /api/site-assets/<filename> URL and
// base64-encodes it, so the exported JSON carries the actual image instead of leaving it behind.
async function readAsset(url: unknown): Promise<{ filename: string; mime: string; data: string } | null> {
  if (typeof url !== 'string') return null
  const path = assetPathFromUrl(url)
  if (!path) return null
  const filename = basename(path)
  try {
    const buffer = await readFile(path)
    const ext    = filename.split('.').pop()?.toLowerCase() ?? ''
    return { filename, mime: CONTENT_TYPES[ext] ?? 'application/octet-stream', data: buffer.toString('base64') }
  } catch {
    return null
  }
}

export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  const settings = await getAllSettings()

  // Supprimer SEO — non utilisé
  delete settings.seo

  // Ancien réglage « connexion PostgreSQL » (supprimé) : jamais exporté
  delete settings.db_config

  // Supprimer la clé API chiffrée du serveur IA — jamais exportée
  if (settings.ai_config && typeof settings.ai_config === 'object') {
    const ai = { ...(settings.ai_config as Record<string, unknown>) }
    delete ai.apiKeyEnc
    settings.ai_config = ai
  }

  // Logo et image de fond : embarqués à part (base64) plutôt que juste référencés —
  // l'URL locale n'a aucun sens sur une autre instance, le fichier lui n'a rien de secret
  let logoAsset: Awaited<ReturnType<typeof readAsset>> = null
  let backgroundAsset: Awaited<ReturnType<typeof readAsset>> = null
  if (settings.branding && typeof settings.branding === 'object') {
    const b = { ...(settings.branding as Record<string, unknown>) }
    logoAsset       = await readAsset(b.logoUrl)
    backgroundAsset = await readAsset(b.backgroundImage)
    delete b.logoUrl
    delete b.backgroundImage
    settings.branding = b
  }

  // Exporter les glossaires et leurs entrées
  const glossariesRes = await query<{ id: number; name: string; description: string }>(
    'SELECT id, name, description FROM glossaries ORDER BY id'
  )
  const glossaries = await Promise.all(glossariesRes.rows.map(async g => {
    const entriesRes = await query<{ source_term: string; target_term: string; source_lang: string; target_lang: string }>(
      'SELECT source_term, target_term, source_lang, target_lang FROM glossary_entries WHERE glossary_id = $1 ORDER BY id',
      [g.id]
    )
    return { name: g.name, description: g.description ?? '', entries: entriesRes.rows }
  }))

  const date   = new Date().toISOString().slice(0, 10)
  const backup = {
    version:    '1.2',
    exportedAt: new Date().toISOString(),
    settings,
    assets: {
      logo:       logoAsset,
      background: backgroundAsset,
    },
    glossaries,
  }

  await logAudit(
    session.user.id,
    session.user.email!,
    'EXPORT_SETTINGS',
    'settings:all',
    { keys: Object.keys(settings), glossaryCount: glossaries.length, assets: [logoAsset && 'logo', backgroundAsset && 'background'].filter(Boolean) }
  )

  return new NextResponse(JSON.stringify(backup, null, 2), {
    headers: {
      'Content-Type':        'application/json',
      'Content-Disposition': `attachment; filename="leksis-config-${date}.json"`,
    },
  })
}

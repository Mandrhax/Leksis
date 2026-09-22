import { NextRequest, NextResponse } from 'next/server'
import { writeFile, unlink, mkdir } from 'node:fs/promises'
import { join }                     from 'node:path'
import { getAdminSession }           from '@/lib/admin-guard'
import { updateSetting, getSetting } from '@/lib/settings'
import { logAudit }                  from '@/lib/audit'
import { query }                     from '@/lib/db'

const ALLOWED_KEYS = [
  'branding',
  'design',
  'features',
  'rewrite_tones',
  'general',
  'ollama_config',
  'ai_config',
  'db_config',
] as const

type AllowedKey = typeof ALLOWED_KEYS[number]

function isAllowedKey(k: string): k is AllowedKey {
  return (ALLOWED_KEYS as readonly string[]).includes(k)
}

const KNOWN_EXTS = ['png', 'jpg', 'jpeg', 'svg', 'webp', 'ico']

function uploadsDir(): string {
  return process.env.UPLOAD_DIR || '/tmp/uploads'
}

interface AssetInput { filename?: unknown; data?: unknown }

// Writes a base64-encoded logo/background from an export back to disk under the fixed slug
// (site-logo / site-bg) used by the normal upload routes, and returns the resulting public URL.
async function writeAsset(asset: AssetInput | null | undefined, slug: string): Promise<string | null> {
  if (!asset || typeof asset.data !== 'string') return null
  const name = typeof asset.filename === 'string' ? asset.filename : ''
  const ext  = name.split('.').pop()?.toLowerCase()
  if (!ext || !KNOWN_EXTS.includes(ext)) return null

  const dir = uploadsDir()
  await mkdir(dir, { recursive: true })
  // Retire toute ancienne variante (extension différente) avant d'écrire la nouvelle
  await Promise.all(KNOWN_EXTS.map(e => unlink(join(dir, `${slug}.${e}`)).catch(() => {})))

  await writeFile(join(dir, `${slug}.${ext}`), Buffer.from(asset.data, 'base64'))
  return `/api/site-assets/${slug}.${ext}?v=${Date.now()}`
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  const body = await req.json().catch(() => null)

  if (!body || typeof body !== 'object' || !body.version || !body.settings || typeof body.settings !== 'object') {
    return NextResponse.json({ error: 'Fichier de backup invalide.' }, { status: 400 })
  }

  const incoming = body.settings as Record<string, unknown>
  const assetsIn = (body.assets && typeof body.assets === 'object' ? body.assets : {}) as { logo?: AssetInput; background?: AssetInput }
  const imported: string[] = []

  for (const key of Object.keys(incoming)) {
    if (!isAllowedKey(key)) continue

    const value = incoming[key]
    if (value === null || typeof value !== 'object') continue

    if (key === 'rewrite_tones') {
      if (!Array.isArray(value) || value.length < 1 || value.length > 6) continue
    }

    if (key === 'branding') {
      const safe = { ...(value as Record<string, unknown>) }
      delete safe.logoUrl
      delete safe.backgroundImage

      // Les images voyagent à part (base64, cf. export) — écrites sur disque puis reliées ici.
      // Sans image dans l'export (ancien format, ou aucune définie), on garde celle déjà en place.
      const existing = await getSetting<Record<string, unknown>>('branding')
      const [logoUrl, backgroundImage] = await Promise.all([
        writeAsset(assetsIn.logo, 'site-logo'),
        writeAsset(assetsIn.background, 'site-bg'),
      ])
      const merged = {
        ...safe,
        logoUrl:         logoUrl ?? existing.logoUrl,
        backgroundImage: backgroundImage ?? existing.backgroundImage,
      }
      await updateSetting('branding', merged, session.user.id, session.user.email!)
      imported.push(key)
      continue
    }

    if (key === 'db_config') {
      // Ne jamais importer passwordEnc — préserver l'existant en base
      const existing = await getSetting<Record<string, unknown>>('db_config')
      const safeValue = { ...(value as Record<string, unknown>) }
      delete safeValue.passwordEnc
      const merged = { ...safeValue, passwordEnc: existing.passwordEnc ?? '' }
      await updateSetting('db_config', merged, session.user.id, session.user.email!)
      imported.push(key)
      continue
    }

    if (key === 'ai_config') {
      // Jamais de clé API importée, et jamais d'autorisation « serveur externe » importée :
      // les deux restent ceux de cette instance
      const existing = await getSetting<Record<string, unknown>>('ai_config')
      const safeValue = { ...(value as Record<string, unknown>) }
      delete safeValue.apiKeyEnc
      const merged = {
        ...safeValue,
        apiKeyEnc:     existing.apiKeyEnc ?? '',
        allowExternal: existing.allowExternal === true,
      }
      await updateSetting('ai_config', merged, session.user.id, session.user.email!, {
        ...safeValue, allowExternal: merged.allowExternal, hasApiKey: merged.apiKeyEnc !== '',
      })
      imported.push(key)
      continue
    }

    await updateSetting(key, value as object, session.user.id, session.user.email!)
    imported.push(key)
  }

  // Importer les glossaires si présents — remplace tous les glossaires existants
  if (Array.isArray(body.glossaries) && body.glossaries.length > 0) {
    await query('DELETE FROM glossaries')
    for (const g of body.glossaries) {
      if (!g.name || typeof g.name !== 'string') continue
      const res = await query<{ id: number }>(
        'INSERT INTO glossaries (name, description) VALUES ($1, $2) RETURNING id',
        [g.name, g.description ?? '']
      )
      const glossaryId = res.rows[0]?.id
      if (!glossaryId || !Array.isArray(g.entries)) continue
      for (const e of g.entries) {
        if (!e.source_term || !e.target_term) continue
        await query(
          'INSERT INTO glossary_entries (glossary_id, source_term, target_term, source_lang, target_lang) VALUES ($1, $2, $3, $4, $5)',
          [glossaryId, e.source_term, e.target_term, e.source_lang ?? null, e.target_lang ?? null]
        )
      }
    }
    await logAudit(session.user.id, session.user.email!, 'IMPORT_GLOSSARIES', 'glossaries:all', { count: body.glossaries.length })
    imported.push('glossaries')
  }

  await logAudit(
    session.user.id,
    session.user.email!,
    'IMPORT_SETTINGS',
    'settings:all',
    { imported }
  )

  return NextResponse.json({ ok: true, imported })
}

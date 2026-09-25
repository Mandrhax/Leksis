import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession }           from '@/lib/admin-guard'
import { updateSetting, getSetting } from '@/lib/settings'
import { logAudit }                  from '@/lib/audit'
import { withTransaction }            from '@/lib/db'
import { LOGO, BACKGROUND, checkAsset, saveAsset, type AssetKind } from '@/lib/site-assets'
import { requestTooLarge }           from '@/lib/validators'
import { AiConfigImportSchema, isValidatedSettingKey, parseSetting, type ValidatedSettingKey } from '@/lib/settings-schema'

// Une config exportée embarque logo (2 Mo) et fond (5 Mo) en base64 : 15 Mo laissent de la marge
const MAX_IMPORT_BYTES = 15 * 1024 * 1024

// Clés importables : celles de l'admin (validées par leur schéma) + ai_config (voir plus bas).
// L'ancien ollama_config n'est plus importé : il n'est lu que comme repli d'anciennes installations.
function isAllowedKey(k: string): k is ValidatedSettingKey | 'ai_config' {
  return k === 'ai_config' || (isValidatedSettingKey(k) && k !== 'seo')
}

interface AssetInput { filename?: unknown; data?: unknown }

// Écrit sur disque un logo/fond embarqué en base64 dans un export et renvoie son URL publique.
// Même contrôles qu'à l'upload : taille et format réel (octets magiques) — le nom de fichier de l'export est ignoré.
async function writeAsset(asset: AssetInput | null | undefined, kind: AssetKind): Promise<string | null> {
  if (!asset || typeof asset.data !== 'string') return null
  if (asset.data.length > Math.ceil(kind.maxBytes * 1.4)) return null // évite de décoder un fichier énorme
  const buffer = Buffer.from(asset.data, 'base64')
  const check  = checkAsset(kind, buffer)
  if (!check.ok) return null
  return saveAsset(kind, buffer, check.format)
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  if (requestTooLarge(req, MAX_IMPORT_BYTES)) {
    return NextResponse.json({ error: 'Fichier de backup trop volumineux.' }, { status: 413 })
  }

  const body = await req.json().catch(() => null)

  if (!body || typeof body !== 'object' || !body.version || !body.settings || typeof body.settings !== 'object') {
    return NextResponse.json({ error: 'Fichier de backup invalide.' }, { status: 400 })
  }

  const incoming = body.settings as Record<string, unknown>
  const assetsIn = (body.assets && typeof body.assets === 'object' ? body.assets : {}) as { logo?: AssetInput; background?: AssetInput }
  const imported: string[] = []
  const skipped: string[] = []

  for (const key of Object.keys(incoming)) {
    if (!isAllowedKey(key)) continue

    const value = incoming[key]
    if (value === null || typeof value !== 'object') continue

    if (key === 'branding') {
      // Les URL d'images ne viennent jamais du fichier : elles sont recréées depuis les images embarquées
      const raw = { ...(value as Record<string, unknown>) }
      delete raw.logoUrl
      delete raw.backgroundImage
      const checked = parseSetting('branding', raw)
      if (!checked.ok) { skipped.push(key); continue }
      const safe = checked.value

      // Les images voyagent à part (base64, cf. export) — écrites sur disque puis reliées ici.
      // Sans image dans l'export (ancien format, ou aucune définie), on garde celle déjà en place.
      const existing = await getSetting<Record<string, unknown>>('branding')
      const [logoUrl, backgroundImage] = await Promise.all([
        writeAsset(assetsIn.logo, LOGO),
        writeAsset(assetsIn.background, BACKGROUND),
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

    if (key === 'ai_config') {
      // Jamais de clé API importée, et jamais d'autorisation « serveur externe » importée :
      // les deux restent ceux de cette instance
      const existing = await getSetting<Record<string, unknown>>('ai_config')
      const checked = AiConfigImportSchema.safeParse(value)
      if (!checked.success) { skipped.push(key); continue }
      const safeValue: Record<string, unknown> = checked.data
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

    const checked = parseSetting(key, value)
    if (!checked.ok) { skipped.push(key); continue }
    await updateSetting(key, checked.value, session.user.id, session.user.email!)
    imported.push(key)
  }

  // Importer les glossaires si présents — remplace tous les glossaires existants
  if (Array.isArray(body.glossaries) && body.glossaries.length > 0) {
    // Tout ou rien : un échec en cours d'import ne doit pas laisser les glossaires à moitié remplacés
    await withTransaction(async tx => {
      await tx('DELETE FROM glossaries')
      for (const g of body.glossaries) {
        if (!g.name || typeof g.name !== 'string') continue
        const res = await tx<{ id: number }>(
          'INSERT INTO glossaries (name, description) VALUES ($1, $2) RETURNING id',
          [g.name, g.description ?? '']
        )
        const glossaryId = res.rows[0]?.id
        if (!glossaryId || !Array.isArray(g.entries)) continue
        for (const e of g.entries) {
          if (typeof e.source_term !== 'string' || typeof e.target_term !== 'string' || !e.source_term || !e.target_term) continue
          await tx(
            'INSERT INTO glossary_entries (glossary_id, source_term, target_term, source_lang, target_lang) VALUES ($1, $2, $3, $4, $5)',
            [glossaryId, e.source_term, e.target_term, e.source_lang ?? null, e.target_lang ?? null]
          )
        }
      }
    })
    await logAudit(session.user.id, session.user.email!, 'IMPORT_GLOSSARIES', 'glossaries:all', { count: body.glossaries.length })
    imported.push('glossaries')
  }

  await logAudit(
    session.user.id,
    session.user.email!,
    'IMPORT_SETTINGS',
    'settings:all',
    { imported, skipped }
  )

  return NextResponse.json({ ok: true, imported, skipped })
}

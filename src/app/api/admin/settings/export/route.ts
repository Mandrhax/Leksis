import { NextResponse }    from 'next/server'
import { getAdminSession } from '@/lib/admin-guard'
import { getAllSettings }  from '@/lib/settings'
import { logAudit }        from '@/lib/audit'
import { query }           from '@/lib/db'

export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  const settings = await getAllSettings()

  // Supprimer SEO — non utilisé
  delete settings.seo

  // Supprimer le mot de passe chiffré — jamais exporté
  if (settings.db_config && typeof settings.db_config === 'object') {
    const db = { ...(settings.db_config as Record<string, unknown>) }
    delete db.passwordEnc
    settings.db_config = db
  }

  // Supprimer logo et image de fond — fichiers locaux non portables
  if (settings.branding && typeof settings.branding === 'object') {
    const b = { ...(settings.branding as Record<string, unknown>) }
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
    version:    '1.1',
    exportedAt: new Date().toISOString(),
    settings,
    glossaries,
  }

  await logAudit(
    session.user.id,
    session.user.email!,
    'EXPORT_SETTINGS',
    'settings:all',
    { keys: Object.keys(settings), glossaryCount: glossaries.length }
  )

  return new NextResponse(JSON.stringify(backup, null, 2), {
    headers: {
      'Content-Type':        'application/json',
      'Content-Disposition': `attachment; filename="leksis-config-${date}.json"`,
    },
  })
}

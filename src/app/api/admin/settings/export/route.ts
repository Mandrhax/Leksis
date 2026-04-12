import { NextResponse }    from 'next/server'
import { getAdminSession } from '@/lib/admin-guard'
import { getAllSettings }  from '@/lib/settings'
import { logAudit }        from '@/lib/audit'

export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  const settings = await getAllSettings()

  // Supprimer le mot de passe chiffré — jamais exporté
  if (settings.db_config && typeof settings.db_config === 'object') {
    const db = { ...(settings.db_config as Record<string, unknown>) }
    delete db.passwordEnc
    settings.db_config = db
  }

  const date   = new Date().toISOString().slice(0, 10)
  const backup = {
    version:    '1.0',
    exportedAt: new Date().toISOString(),
    settings,
  }

  await logAudit(
    session.user.id,
    session.user.email!,
    'EXPORT_SETTINGS',
    'settings:all',
    { keys: Object.keys(settings) }
  )

  return new NextResponse(JSON.stringify(backup, null, 2), {
    headers: {
      'Content-Type':        'application/json',
      'Content-Disposition': `attachment; filename="leksis-config-${date}.json"`,
    },
  })
}

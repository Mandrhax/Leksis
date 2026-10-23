import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-guard'
import { getSetting } from '@/lib/settings'
import { checkForUpdate } from '@/lib/update-check'
import pkg from '../../../../../package.json'

// Carte « Leksis » du dashboard : une version plus récente est-elle publiée pour le canal de cette installation ?
export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  let enabled = true
  try {
    const general = await getSetting<{ updateCheck?: boolean }>('general')
    enabled = general?.updateCheck !== false
  } catch { /* base injoignable : réglage par défaut */ }
  return NextResponse.json(await checkForUpdate(pkg.version, enabled))
}

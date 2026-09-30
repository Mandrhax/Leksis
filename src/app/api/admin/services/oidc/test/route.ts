import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminSession } from '@/lib/admin-guard'
import { logAudit } from '@/lib/audit'
import { testOidcDiscovery } from '@/lib/auth-methods'

const Schema = z.object({ issuer: z.string().url() })

/** Teste l'issuer OIDC en cours d'édition (non enregistré) : découverte seule, ni clientId ni secret requis. */
export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const parsed = Schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: 'Invalid issuer URL' })
  }

  const result = await testOidcDiscovery(parsed.data.issuer)
  await logAudit(session.user.id, session.user.email!, 'TEST_SERVICE', 'service:oidc', result)
  return NextResponse.json(result)
}

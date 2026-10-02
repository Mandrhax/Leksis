import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { getAuthMethod } from '@/lib/auth-methods'
import { acceptInvitation } from '@/lib/accounts'
import { hashPassword } from '@/lib/password'

const INVITE_PER_IP_PER_MIN = 10

const BodySchema = z.object({
  token:    z.string().min(1).max(200),
  password: z.string().min(10).max(200),
})

/** Choix du mot de passe depuis un lien d'invitation (voir /api/admin/users/[id]/invite-link). */
export async function POST(req: NextRequest) {
  const method = await getAuthMethod()
  if (method !== 'password_admin_approval' && method !== 'password_email_verify') {
    return NextResponse.json({ error: 'Password sign-in is not active.', code: 'method_disabled' }, { status: 403 })
  }

  const ip = getClientIp(req)
  const ipLimit = ip === 'unknown' ? { ok: true as const } : checkRateLimit(`invite-ip:${ip}`, INVITE_PER_IP_PER_MIN)
  if (!ipLimit.ok) return rateLimitResponse(ipLimit.retryAfterSec)

  const parsed = BodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid data.', code: 'invalid' }, { status: 400 })

  try {
    const result = await acceptInvitation(parsed.data.token, await hashPassword(parsed.data.password))
    if (!result.ok) return NextResponse.json({ error: 'This invitation link is invalid or has expired.', code: 'invalid_link' }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[invite] DB error:', err)
    return NextResponse.json({ error: 'Service unavailable. Check the database connection.' }, { status: 503 })
  }
}

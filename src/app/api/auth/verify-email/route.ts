import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit, getClientIp, getRequestOrigin, rateLimitResponse } from '@/lib/rate-limit'
import { activateVerifiedAccount, consumeEmailToken } from '@/lib/accounts'

const VERIFY_PER_IP_PER_MIN = 20

export async function GET(req: NextRequest) {
  // Token opaque de 256 bits, non devinable : un rate limit par IP suffit (pas besoin d'un second axe par email).
  const ip = getClientIp(req)
  const ipLimit = ip === 'unknown' ? { ok: true as const } : checkRateLimit(`verify-email-ip:${ip}`, VERIFY_PER_IP_PER_MIN)
  if (!ipLimit.ok) return rateLimitResponse(ipLimit.retryAfterSec)

  const token = req.nextUrl.searchParams.get('token') ?? ''
  const email = token ? await consumeEmailToken(token, 'verify_email') : null

  // Garde contre un token périmé réactivant un compte modifié depuis (désactivé, déjà actif autrement…)
  const activated = email ? await activateVerifiedAccount(email) : false

  // getRequestOrigin, pas req.url : en interne le serveur ne voit que du HTTP même quand Caddy sert du HTTPS.
  const redirectTo = new URL(`/auth/signin?verify=${activated ? 'ok' : 'invalid'}`, getRequestOrigin(req))
  return NextResponse.redirect(redirectTo)
}

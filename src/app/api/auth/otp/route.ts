import { NextRequest, NextResponse } from 'next/server'
import { getOrCreateUser, generateOtp } from '@/lib/otp'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'

const OTP_PER_IP_PER_MIN    = 20
const OTP_PER_EMAIL_PER_MIN = 5

export async function POST(req: NextRequest) {
  // Chaque appel peut créer un compte : on freine les rafales (par adresse IP et par email)
  const ip = getClientIp(req)
  const ipLimit = ip === 'unknown' ? { ok: true as const } : checkRateLimit(`otp-ip:${ip}`, OTP_PER_IP_PER_MIN)
  if (!ipLimit.ok) return rateLimitResponse(ipLimit.retryAfterSec)

  const body = await req.json().catch(() => null)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : null

  if (!email) {
    return NextResponse.json({ error: 'Email requis' }, { status: 400 })
  }

  const emailLimit = checkRateLimit(`otp-email:${email}`, OTP_PER_EMAIL_PER_MIN)
  if (!emailLimit.ok) return rateLimitResponse(emailLimit.retryAfterSec)

  try {
    await getOrCreateUser(email)
    const code = await generateOtp(email)
    return NextResponse.json({ code })
  } catch (err) {
    console.error('[OTP] DB error:', err)
    return NextResponse.json({ error: 'Service indisponible. Vérifiez la connexion à la base de données.' }, { status: 503 })
  }
}

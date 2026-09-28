import { NextRequest, NextResponse } from 'next/server'
import { getOrCreateUser, generateOtp } from '@/lib/otp'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { isValidEmail } from '@/lib/validators'
import { getSmtpConfig, isSmtpConfigured, sendOtpEmail } from '@/lib/smtp'
import { getSetting } from '@/lib/settings'

const OTP_PER_IP_PER_MIN    = 20
const OTP_PER_EMAIL_PER_MIN = 5

// Un relais SMTP mal configuré ne doit pas laisser la requête pendre indéfiniment
export const maxDuration = 30

export async function POST(req: NextRequest) {
  // Chaque appel peut créer un compte : on freine les rafales (par adresse IP et par email)
  const ip = getClientIp(req)
  const ipLimit = ip === 'unknown' ? { ok: true as const } : checkRateLimit(`otp-ip:${ip}`, OTP_PER_IP_PER_MIN)
  if (!ipLimit.ok) return rateLimitResponse(ipLimit.retryAfterSec)

  const body = await req.json().catch(() => null)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : null

  if (!email) {
    return NextResponse.json({ error: 'Email is required.' }, { status: 400 })
  }
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: 'Invalid email address.' }, { status: 400 })
  }

  const emailLimit = checkRateLimit(`otp-email:${email}`, OTP_PER_EMAIL_PER_MIN)
  if (!emailLimit.ok) return rateLimitResponse(emailLimit.retryAfterSec)

  try {
    const user = await getOrCreateUser(email)
    if (user.disabled) {
      return NextResponse.json({ error: 'This account is disabled.', code: 'account_disabled' }, { status: 403 })
    }
    const code = await generateOtp(email)

    const smtp = await getSmtpConfig()
    if (isSmtpConfigured(smtp)) {
      try {
        const branding = await getSetting<{ siteName?: string }>('branding')
        await sendOtpEmail(smtp, { to: email, code, siteName: branding.siteName || 'Leksis' })
        return NextResponse.json({ emailSent: true })
      } catch (err) {
        // Configuré mais l'envoi échoue : on refuse plutôt que d'afficher le code en repli silencieux,
        // ce qui annulerait sans le dire la protection que l'admin vient d'activer.
        console.error('[OTP] email send failed:', err)
        return NextResponse.json({ error: 'Failed to send the sign-in code by email.', code: 'email_failed' }, { status: 503 })
      }
    }

    return NextResponse.json({ code, emailSent: false })
  } catch (err) {
    console.error('[OTP] DB error:', err)
    return NextResponse.json({ error: 'Service unavailable. Check the database connection.' }, { status: 503 })
  }
}

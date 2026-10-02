import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { getPublicOrigin } from '@/lib/public-origin'
import { isValidEmail } from '@/lib/validators'
import { getAllowedDomains, getAuthMethod, getInviteOnly } from '@/lib/auth-methods'
import { isEmailDomainAllowed } from '@/lib/email-domains'
import { createEmailToken, createOrAttachPendingAccount } from '@/lib/accounts'
import { hashPassword } from '@/lib/password'
import { getSmtpConfig, isSmtpConfigured, sendVerificationEmail } from '@/lib/smtp'
import { getSetting } from '@/lib/settings'

const SIGNUP_PER_IP_PER_MIN    = 10
const SIGNUP_PER_EMAIL_PER_MIN = 5

// Un relais SMTP mal configuré ne doit pas laisser la requête pendre indéfiniment
export const maxDuration = 30

const BodySchema = z.object({
  email:    z.string(),
  password: z.string().min(10).max(200),
  name:     z.string().max(120).optional(),
})

async function sendVerification(req: NextRequest, email: string): Promise<NextResponse | null> {
  const smtp = await getSmtpConfig()
  if (!isSmtpConfigured(smtp)) {
    // L'admin a activé ce mode sans relais SMTP configuré : signalé, jamais de compte fantôme silencieux
    return NextResponse.json({ error: 'Email verification is not available right now.', code: 'email_failed' }, { status: 503 })
  }
  try {
    const token = await createEmailToken(email, 'verify_email')
    const branding = await getSetting<{ siteName?: string }>('branding')
    const link = `${await getPublicOrigin(req)}/api/auth/verify-email?token=${token}`
    await sendVerificationEmail(smtp, { to: email, link, siteName: branding.siteName || 'Leksis' })
    return null
  } catch (err) {
    console.error('[signup] verification email failed:', err)
    return NextResponse.json({ error: 'Failed to send the verification email.', code: 'email_failed' }, { status: 503 })
  }
}

export async function POST(req: NextRequest) {
  const method = await getAuthMethod()
  if (method !== 'password_admin_approval' && method !== 'password_email_verify') {
    return NextResponse.json({ error: 'Sign-up is not available.', code: 'method_disabled' }, { status: 403 })
  }

  // Chaque appel peut créer un compte : on freine les rafales (par adresse IP et par email)
  const ip = getClientIp(req)
  const ipLimit = ip === 'unknown' ? { ok: true as const } : checkRateLimit(`signup-ip:${ip}`, SIGNUP_PER_IP_PER_MIN)
  if (!ipLimit.ok) return rateLimitResponse(ipLimit.retryAfterSec)

  const parsed = BodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid data.', code: 'invalid' }, { status: 400 })
  }

  const email = parsed.data.email.trim().toLowerCase()
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: 'Invalid email address.', code: 'invalid' }, { status: 400 })
  }
  const name = parsed.data.name?.trim() || null

  if (await getInviteOnly()) {
    return NextResponse.json({ error: 'Access is by invitation only.', code: 'not_invited' }, { status: 403 })
  }

  if (!isEmailDomainAllowed(email, await getAllowedDomains())) {
    return NextResponse.json({ error: 'This email domain is not allowed.', code: 'domain_not_allowed' }, { status: 403 })
  }

  const emailLimit = checkRateLimit(`signup-email:${email}`, SIGNUP_PER_EMAIL_PER_MIN)
  if (!emailLimit.ok) return rateLimitResponse(emailLimit.retryAfterSec)

  try {
    const status = method === 'password_admin_approval' ? 'pending_approval' : 'pending_verification'
    const passwordHash = await hashPassword(parsed.data.password)
    const result = await createOrAttachPendingAccount(email, name, passwordHash, status)

    if (result.outcome === 'already_active') {
      return NextResponse.json({ error: 'An account already exists for this email.', code: 'email_taken' }, { status: 409 })
    }
    if (result.outcome === 'already_pending') {
      return NextResponse.json({ ok: true, status: 'pending_approval' })
    }

    // 'created' / 'resend_verification' : n'envoyer un email que si ce mode en dépend —
    // un 'resend_verification' hérité d'un ancien changement de méthode ne doit pas forcer un envoi
    // alors que l'admin est repassé en validation manuelle (SMTP potentiellement plus configuré du tout).
    if (method === 'password_email_verify') {
      const failure = await sendVerification(req, email)
      if (failure) return failure
      return NextResponse.json({ ok: true, status: 'pending_verification' })
    }

    return NextResponse.json({ ok: true, status: 'pending_approval' })
  } catch (err) {
    console.error('[signup] DB error:', err)
    return NextResponse.json({ error: 'Service unavailable. Check the database connection.' }, { status: 503 })
  }
}

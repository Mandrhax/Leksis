import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-guard'
import { logAudit } from '@/lib/audit'
import { query } from '@/lib/db'
import { createEmailToken, INVITE_TOKEN_TTL_MS } from '@/lib/accounts'
import { getAuthMethod } from '@/lib/auth-methods'
import { getPublicOrigin } from '@/lib/public-origin'
import { getSmtpConfig, isSmtpConfigured, sendInvitationEmail } from '@/lib/smtp'
import { getSetting } from '@/lib/settings'

const DAYS = INVITE_TOKEN_TTL_MS / (24 * 60 * 60 * 1000)

/**
 * Génère un lien d'invitation : la personne l'ouvre et choisit elle-même son mot de passe. Ne sert qu'avec
 * une méthode mot de passe (les autres n'ont pas de mot de passe à choisir). Un nouveau lien remplace le
 * précédent. Le lien est renvoyé à l'admin une seule fois ; si un relais SMTP est configuré, il est aussi
 * envoyé par email (au mieux : un échec d'envoi n'empêche pas l'admin de le transmettre à la main).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

    const method = await getAuthMethod()
    if (method !== 'password_admin_approval' && method !== 'password_email_verify') {
      return NextResponse.json({ error: 'Invitation links need a password sign-in method.', code: 'method_not_password' }, { status: 400 })
    }

    const { id } = await params
    const found = await query<{ email: string; disabled: boolean }>('SELECT email, disabled FROM users WHERE id = $1', [id])
    const user = found.rows[0]
    if (!user) return NextResponse.json({ error: 'User not found.', code: 'not_found' }, { status: 404 })
    if (user.disabled) return NextResponse.json({ error: 'This account is disabled.', code: 'account_disabled' }, { status: 400 })

    const token = await createEmailToken(user.email, 'invite', INVITE_TOKEN_TTL_MS)
    const link = `${await getPublicOrigin(req)}/auth/invite?token=${token}`

    let emailSent = false
    const smtp = await getSmtpConfig()
    if (isSmtpConfigured(smtp)) {
      try {
        const branding = await getSetting<{ siteName?: string }>('branding')
        await sendInvitationEmail(smtp, { to: user.email, link, siteName: branding.siteName || 'Leksis', days: DAYS })
        emailSent = true
      } catch (err) {
        console.error('[invite-link] email failed:', err)
      }
    }

    // Le lien (donc le jeton) ne part jamais dans le journal d'audit
    await logAudit(session.user.id, session.user.email!, 'INVITE_LINK', `user:${id}`, { email: user.email, emailSent })
    return NextResponse.json({ ok: true, email: user.email, link, emailSent, days: DAYS })
  } catch (err) {
    console.error('[POST /api/admin/users/[id]/invite-link]', err)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}

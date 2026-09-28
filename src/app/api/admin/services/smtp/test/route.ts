import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminSession } from '@/lib/admin-guard'
import { logAudit } from '@/lib/audit'
import { getSmtpConfig, verifySmtpConnection, sendMail } from '@/lib/smtp'
import { isValidEmail } from '@/lib/validators'
import { encrypt } from '@/lib/crypto'

const Schema = z.object({
  host:        z.string().max(255),
  port:        z.number().int().min(1).max(65535),
  secure:      z.boolean().optional(),
  user:        z.string().max(255).optional(),
  password:    z.string().max(500).optional(),   // vide = mot de passe enregistré
  fromAddress: z.string().max(254).refine(isValidEmail, 'Invalid email'),
  fromName:    z.string().max(120).optional(),
  // Renseigné : envoie un message réel plutôt que de seulement vérifier la connexion
  to:          z.string().max(254).optional(),
})

/**
 * Teste la configuration SMTP en cours d'édition (non enregistrée) : vérifie la connexion,
 * ou envoie un message réel à `to` si fourni (certains relais n'échouent qu'à l'étape RCPT/DATA).
 */
export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const parsed = Schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const data = parsed.data

  if (data.to && !isValidEmail(data.to)) {
    return NextResponse.json({ ok: false, message: 'Invalid recipient address' })
  }

  // Un mot de passe tapé pour ce test n'est jamais enregistré : on le passe directement au transport
  const stored = await getSmtpConfig()
  const cfg = {
    host:        data.host,
    port:        data.port,
    secure:      data.secure ?? false,
    user:        data.user ?? '',
    passEnc:     data.password ? encrypt(data.password) : stored.passEnc,
    fromAddress: data.fromAddress,
    fromName:    data.fromName ?? '',
  }

  try {
    if (data.to) {
      await sendMail(cfg, { to: data.to, subject: 'Leksis — Test email', text: 'This is a test email from Leksis. Your SMTP configuration works.' })
      await logAudit(session.user.id, session.user.email!, 'TEST_SERVICE', 'service:smtp', { ok: true, sentTo: data.to })
      return NextResponse.json({ ok: true, sent: true })
    }
    const result = await verifySmtpConnection(cfg)
    await logAudit(session.user.id, session.user.email!, 'TEST_SERVICE', 'service:smtp', result)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    await logAudit(session.user.id, session.user.email!, 'TEST_SERVICE', 'service:smtp', { ok: false, message })
    return NextResponse.json({ ok: false, message })
  }
}

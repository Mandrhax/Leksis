import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-guard'
import { z } from 'zod'
import { logAudit } from '@/lib/audit'
import { getAllowedDomains } from '@/lib/auth-methods'
import { isEmailDomainAllowed } from '@/lib/email-domains'
import { isValidEmail } from '@/lib/validators'
import { inviteUser, listUsers } from '@/lib/users'

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const sp = req.nextUrl.searchParams
  try {
    const result = await listUsers({
      page:     parseInt(sp.get('page') ?? '1', 10),
      pageSize: parseInt(sp.get('pageSize') ?? '', 10),
      q:        sp.get('q') ?? '',
    })
    return NextResponse.json(result)
  } catch (err) {
    console.error('[GET /api/admin/users]', err)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}

const InviteSchema = z.object({
  email: z.string(),
  name:  z.string().max(120).optional(),
  role:  z.enum(['user', 'admin']).optional(),
})

/** Crée à l'avance le compte d'une personne (mode « invitation seulement »). */
export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const parsed = InviteSchema.safeParse(await req.json().catch(() => null))
  const email = parsed.success ? parsed.data.email.trim().toLowerCase() : ''
  if (!parsed.success || !isValidEmail(email)) {
    return NextResponse.json({ error: 'Invalid email address.', code: 'invalid_email' }, { status: 400 })
  }
  // Inutile d'inviter quelqu'un qui ne pourrait pas se connecter
  if (!isEmailDomainAllowed(email, await getAllowedDomains())) {
    return NextResponse.json({ error: 'This email domain is not allowed.', code: 'domain_not_allowed' }, { status: 400 })
  }

  try {
    const result = await inviteUser({ email, name: parsed.data.name, role: parsed.data.role })
    if (!result.ok) return NextResponse.json({ error: 'An account already exists for this email.', code: result.error }, { status: 409 })
    await logAudit(session.user.id, session.user.email!, 'INVITE_USER', `user:${result.user.id}`, { email, role: result.user.role })
    return NextResponse.json({ ok: true, user: result.user }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/admin/users]', err)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}

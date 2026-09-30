import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/lib/user-guard'
import { getAuthMethod } from '@/lib/auth-methods'
import { getAccountByEmail } from '@/lib/accounts'
import { hashPassword, verifyPassword } from '@/lib/password'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { query } from '@/lib/db'

export const dynamic = 'force-dynamic'

/** Le bloc "Password" de /settings ne s'affiche que si la méthode active en dépend réellement. */
export async function GET() {
  const guard = await requireUser()
  if (guard.error) return guard.error

  const method = await getAuthMethod()
  return NextResponse.json({ changeable: method === 'password_admin_approval' || method === 'password_email_verify' })
}

const PatchSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword:      z.string().min(10).max(200),
})

export async function PATCH(req: NextRequest) {
  const guard = await requireUser()
  if (guard.error) return guard.error
  const { session } = guard

  // Changer un mot de passe qui ne sert à rien (méthode désactivée depuis) n'a pas de sens
  const method = await getAuthMethod()
  if (method !== 'password_admin_approval' && method !== 'password_email_verify') {
    return NextResponse.json({ error: 'Password sign-in is not the active method.', code: 'method_disabled' }, { status: 403 })
  }

  const rl = checkRateLimit(`password-change:${session.user.id}`, 10)
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec)

  const parsed = PatchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid data.', code: 'invalid' }, { status: 400 })
  }

  const account = await getAccountByEmail(session.user.email!)
  if (!account?.password_hash || !(await verifyPassword(account.password_hash, parsed.data.currentPassword))) {
    return NextResponse.json({ error: 'Current password is incorrect.', code: 'wrong_password' }, { status: 400 })
  }

  const newHash = await hashPassword(parsed.data.newPassword)
  await query('UPDATE users SET password_hash = $2 WHERE id = $1', [session.user.id, newHash])

  return NextResponse.json({ ok: true })
}

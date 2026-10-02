import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit, getClientIp, getRequestOrigin, rateLimitResponse } from '@/lib/rate-limit'
import { activateVerifiedAccount, consumeEmailToken } from '@/lib/accounts'

const VERIFY_PER_IP_PER_MIN = 20

// getRequestOrigin, pas req.url : en interne le serveur ne voit que du HTTP même quand Caddy sert du HTTPS.
function redirect(req: NextRequest, path: string, status = 307): NextResponse {
  return NextResponse.redirect(new URL(path, getRequestOrigin(req)), status)
}

/**
 * Le lien de l'email n'active RIEN : un scanner de messagerie (ou un aperçu de lien) suit les GET
 * automatiquement et validerait sinon un compte que son propriétaire n'a jamais confirmé. Il mène à la page
 * de connexion, qui demande un clic et envoie le jeton en POST (ci-dessous).
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') ?? ''
  if (!token) return redirect(req, '/auth/signin?verify=invalid')
  return redirect(req, `/auth/signin?verify=confirm&token=${encodeURIComponent(token)}`)
}

export async function POST(req: NextRequest) {
  // Token opaque de 256 bits, non devinable : un rate limit par IP suffit (pas besoin d'un second axe par email).
  const ip = getClientIp(req)
  const ipLimit = ip === 'unknown' ? { ok: true as const } : checkRateLimit(`verify-email-ip:${ip}`, VERIFY_PER_IP_PER_MIN)
  if (!ipLimit.ok) return rateLimitResponse(ipLimit.retryAfterSec)

  const form = await req.formData().catch(() => null)
  const raw = form?.get('token')
  const token = typeof raw === 'string' ? raw : ''
  const email = token ? await consumeEmailToken(token, 'verify_email') : null

  // Garde contre un token périmé réactivant un compte modifié depuis (désactivé, déjà actif autrement…)
  const activated = email ? await activateVerifiedAccount(email) : false

  // 303 : le navigateur rejoue la redirection en GET (un 307 renverrait le POST à la page de connexion)
  return redirect(req, `/auth/signin?verify=${activated ? 'ok' : 'invalid'}`, 303)
}

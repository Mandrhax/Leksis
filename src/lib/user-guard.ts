import 'server-only'
import { auth } from '@/auth'
import type { Session } from 'next-auth'
import { headers } from 'next/headers'
import { isCrossSiteRequest } from '@/lib/csrf'
import { getSetting } from '@/lib/settings'
import { getDynamicLimits } from '@/lib/limits'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'

type Guard = { session: Session; error?: undefined } | { session?: undefined; error: Response }

const json = (body: object, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/**
 * À appeler en tête de chaque route API réservée aux utilisateurs connectés.
 * Le proxy filtre déjà les visiteurs anonymes ; ce garde est la défense en profondeur, et applique
 * aussi le mode maintenance (les non-admins n'ont plus accès aux API) et la limite de débit par utilisateur.
 *
 *   const guard = await requireUser({ rateLimit: true }); if (guard.error) return guard.error
 */
export async function requireUser(opts: { rateLimit?: boolean } = {}): Promise<Guard> {
  // Requête envoyée par un autre site avec le cookie de l'utilisateur (CSRF, voir lib/csrf.ts)
  if (isCrossSiteRequest(await headers())) {
    return { error: json({ error: 'Cross-site request refused.', code: 'cross_site' }, 403) }
  }
  const session = await auth()
  if (!session?.user?.id) return { error: json({ error: 'Unauthorized.' }, 401) }

  const isAdmin = session.user.role === 'admin'

  if (!isAdmin) {
    try {
      const general = await getSetting<{ maintenanceMode?: boolean }>('general')
      if (general.maintenanceMode) {
        return { error: json({ error: 'The service is under maintenance.', code: 'maintenance' }, 503) }
      }
    } catch { /* base indisponible : on ne bloque pas sur ce réglage */ }
  }

  if (opts.rateLimit) {
    const { rateLimitPerMin } = await getDynamicLimits()
    const rl = checkRateLimit(`ai:${session.user.id}`, rateLimitPerMin)
    if (!rl.ok) return { error: rateLimitResponse(rl.retryAfterSec) }
  }

  return { session }
}

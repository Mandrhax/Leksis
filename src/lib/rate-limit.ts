import 'server-only'

// Limiteur à fenêtre glissante, en mémoire. L'app tourne en une seule instance (un conteneur) :
// pas besoin d'un magasin partagé. Les compteurs sont perdus au redémarrage, c'est voulu.

const buckets = new Map<string, number[]>()
const MAX_KEYS = 10_000

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSec: number }

/** Compte un appel pour `key` ; refuse si `limit` appels ont déjà eu lieu dans la fenêtre. limit <= 0 : illimité. */
export function checkRateLimit(key: string, limit: number, windowMs = 60_000): RateLimitResult {
  if (limit <= 0) return { ok: true }

  const now = Date.now()
  const hits = (buckets.get(key) ?? []).filter(t => now - t < windowMs)

  if (hits.length >= limit) {
    buckets.set(key, hits)
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((hits[0] + windowMs - now) / 1000)) }
  }

  hits.push(now)
  buckets.set(key, hits)

  // Évite qu'une rafale de clés distinctes (IP) fasse grossir la mémoire sans limite
  if (buckets.size > MAX_KEYS) {
    for (const [k, v] of buckets) {
      if (!v.length || now - v[v.length - 1] >= windowMs) buckets.delete(k)
    }
  }
  return { ok: true }
}

/** Adresse du client : Caddy transmet X-Forwarded-For (proxys de confiance uniquement). */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim() || 'unknown'
  return req.headers.get('x-real-ip')?.trim() || 'unknown'
}

export function rateLimitResponse(retryAfterSec: number): Response {
  return new Response(JSON.stringify({ error: 'Too many requests. Please wait a moment and try again.', code: 'rate_limited' }), {
    status: 429,
    headers: { 'Content-Type': 'application/json', 'Retry-After': String(retryAfterSec) },
  })
}

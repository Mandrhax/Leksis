// Refus des requêtes envoyées par un autre site (CSRF) — module pur, testable.
//
// Le cookie de session est SameSite=Lax : il protège d'un site tiers, mais pas d'un site du même « site »
// (une autre application de l'intranet, la même IP sur un autre port). Les gardes des routes API
// (requireUser, getAdminSession) refusent donc toute requête qu'un navigateur signale comme venant d'ailleurs.

type HeaderReader = { get(name: string): string | null }

/**
 * true si le navigateur indique que la requête vient d'une autre origine.
 * Sec-Fetch-Site d'abord (envoyé par les navigateurs récents, en HTTPS ou sur localhost seulement), sinon
 * Origin comparé à l'hôte demandé (Host, ou X-Forwarded-Host posé par Caddy). Sans l'un ni l'autre (curl,
 * script, ancienne requête GET), rien à refuser : un navigateur envoie toujours Origin sur un POST d'un autre site.
 */
export function isCrossSiteRequest(h: HeaderReader): boolean {
  const site = h.get('sec-fetch-site')
  if (site) return site !== 'same-origin' && site !== 'none'

  const origin = h.get('origin')
  if (!origin) return false
  let originHost: string
  try {
    originHost = new URL(origin).host.toLowerCase()
  } catch {
    return true   // « null » (iframe sandbox, redirection opaque) ou valeur illisible
  }
  const host = (h.get('x-forwarded-host') ?? h.get('host') ?? '').split(',')[0].trim().toLowerCase()
  return host === '' || originHost !== host
}

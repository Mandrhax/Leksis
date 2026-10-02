// Domaines email autorisés à utiliser la plateforme (toutes méthodes de connexion) — pur, sans dépendance serveur.

/** « acme.ch, @sub.acme.ch » → ['acme.ch', 'sub.acme.ch'] (minuscules, sans @, séparateurs : virgule, point-virgule, espace, retour ligne). */
export function parseAllowedDomains(raw: string): string[] {
  return raw
    .split(/[\s,;]+/)
    .map(d => d.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean)
}

/** Domaine d'une adresse (ce qui suit l'unique @), en minuscules ; null si l'adresse n'a pas la forme x@y. */
export function emailDomain(email: string | null | undefined): string | null {
  const e = (email ?? '').trim().toLowerCase()
  const at = e.lastIndexOf('@')
  if (at < 1 || e.indexOf('@') !== at || at === e.length - 1) return null
  return e.slice(at + 1)
}

/**
 * Liste vide = aucune restriction. Sinon le domaine doit figurer EXACTEMENT dans la liste :
 * `evilacme.ch` ou `acme.ch.evil.com` ne passent pas pour `acme.ch` (sous-domaines à lister explicitement).
 */
export function isEmailDomainAllowed(email: string | null | undefined, allowedDomains: string): boolean {
  const domains = parseAllowedDomains(allowedDomains)
  if (domains.length === 0) return true
  const domain = emailDomain(email)
  return domain !== null && domains.includes(domain)
}

// Qui peut entrer par SSO — pur, sans dépendance serveur (testable et importable partout).

/** « acme.ch, @sub.acme.ch » → ['acme.ch', 'sub.acme.ch'] (minuscules, sans @, séparateurs : virgule, espace, retour ligne). */
export function parseAllowedDomains(raw: string): string[] {
  return raw
    .split(/[\s,;]+/)
    .map(d => d.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean)
}

/**
 * Une identité OIDC est acceptée si son email est présent, n'est pas explicitement non vérifié par le
 * fournisseur (`email_verified: false` — un fournisseur qui n'envoie pas la revendication, comme Entra ID,
 * n'est pas pénalisé), et si son domaine figure dans la liste autorisée (liste vide = tous les domaines).
 * Comparaison sur le domaine EXACT : `evilacme.ch` ou `acme.ch.evil.com` ne passent pas pour `acme.ch`.
 */
export function isOidcIdentityAccepted(input: {
  email: string | null | undefined
  emailVerified: boolean | undefined
  allowedDomains: string
}): boolean {
  const email = (input.email ?? '').trim().toLowerCase()
  const at = email.lastIndexOf('@')
  if (at < 1 || email.indexOf('@') !== at) return false
  if (input.emailVerified === false) return false

  const domains = parseAllowedDomains(input.allowedDomains)
  if (domains.length === 0) return true
  return domains.includes(email.slice(at + 1))
}

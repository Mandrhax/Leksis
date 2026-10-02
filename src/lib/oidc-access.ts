// Règles propres au SSO — pur, sans dépendance serveur (testable et importable partout).
import { emailDomain, isEmailDomainAllowed, parseAllowedDomains } from './email-domains'

export { parseAllowedDomains }

/**
 * Une identité OIDC est acceptée si son email est présent, n'est pas explicitement non vérifié par le
 * fournisseur (`email_verified: false` — un fournisseur qui n'envoie pas la revendication, comme Entra ID,
 * n'est pas pénalisé), et si son domaine est autorisé (voir isEmailDomainAllowed ; liste vide = tous).
 */
export function isOidcIdentityAccepted(input: {
  email: string | null | undefined
  emailVerified: boolean | undefined
  allowedDomains: string
}): boolean {
  if (emailDomain(input.email) === null) return false
  if (input.emailVerified === false) return false
  return isEmailDomainAllowed(input.email, input.allowedDomains)
}

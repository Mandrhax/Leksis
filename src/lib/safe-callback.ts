// Chemin de retour après connexion — module pur (client et tests).

/**
 * Le proxy construit callbackUrl avec l'adresse INTERNE du serveur Next (http://0.0.0.0:3000/…) quand
 * NEXTAUTH_URL n'est pas définie : on ne garde que le chemin, relatif à l'adresse réellement utilisée par le
 * navigateur. Protège aussi contre une redirection vers un autre site : un chemin qui commence par « // » ou
 * « /\ » (`https://x//evil.com`) serait lu par le navigateur comme une adresse d'un autre hôte.
 */
export function safeCallbackPath(raw: string, origin: string): string {
  try {
    const url = new URL(raw, origin)
    const path = `${url.pathname}${url.search}${url.hash}`
    return /^\/[/\\]/.test(path) ? '/' : path
  } catch {
    return '/'
  }
}

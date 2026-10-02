import 'server-only'
import { getSetting } from '@/lib/settings'
import { getRequestOrigin } from '@/lib/rate-limit'
import { isDomainName, resolveCaddyConfig, type CaddyConfig } from '@/lib/caddy-config'

/**
 * Origine à mettre dans un lien envoyé par email. En mode HTTPS avec domaine, c'est le domaine enregistré par
 * l'admin : un en-tête Host / X-Forwarded-Host forgé ne peut alors pas rediriger le lien (et son jeton) vers
 * un autre site. Sans domaine configuré (HTTP par IP, derrière un proxy), on ne peut que se fier à la requête.
 */
export function pickPublicOrigin(config: CaddyConfig, requestOrigin: string): string {
  if (config.mode === 'https' && isDomainName(config.host)) return `https://${config.host.trim()}`
  return requestOrigin
}

export async function getPublicOrigin(req: Request): Promise<string> {
  const saved = await getSetting<Record<string, unknown>>('caddy_config')
  return pickPublicOrigin(resolveCaddyConfig(saved, process.env.CADDY_HOST ?? ''), getRequestOrigin(req))
}

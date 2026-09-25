// Réglages d'accès (Caddy) — module partagé serveur/client : aucune dépendance serveur.
// ⚠️ install.sh (caddyfile_content) génère le même Caddyfile : les garder synchronisés.

/**
 * Comment les utilisateurs joignent Leksis :
 *  - http  : HTTP simple sur l'adresse IP / le nom du serveur (le plus simple)
 *  - https : HTTPS avec un nom de domaine (certificat Let's Encrypt automatique)
 *  - proxy : derrière un proxy inverse (NPM, Traefik…) qui gère le HTTPS
 */
export type AccessMode = 'http' | 'https' | 'proxy'

export interface CaddyConfig {
  mode: AccessMode
  /** Nom de domaine — utilisé seulement en mode https */
  host: string
  /** Mode https : garde un accès HTTP par adresse IP (secours tant que le certificat n'est pas émis) */
  keepHttpFallback: boolean
  /** Mode proxy : adresses (IP / CIDR) du proxy s'il n'est pas sur un réseau privé */
  trustedProxies: string
}

export const DEFAULT_CADDY_CONFIG: CaddyConfig = {
  mode: 'http',
  host: '',
  keepHttpFallback: true,
  trustedProxies: '',
}

const DOMAIN_RE = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/i
const PROXY_ADDR_RE = /^[0-9a-f:.]+(\/\d{1,3})?$/i

/** Nom de domaine (pas une adresse IP : Let's Encrypt ne délivre pas de certificat pour une IP). */
export function isDomainName(host: string): boolean {
  return DOMAIN_RE.test(host.trim())
}

/** Liste d'adresses de proxy nettoyée (séparées par espace ou virgule) ; null si une entrée est invalide. */
export function cleanTrustedProxies(input: string): string | null {
  const parts = input.split(/[\s,]+/).filter(Boolean)
  if (!parts.every(p => PROXY_ADDR_RE.test(p))) return null
  return parts.join(' ')
}

/**
 * Configuration effective à partir de ce qui est enregistré en base.
 * Ancien format `{ host, behindProxy }` : un domaine = https, sinon proxy / http selon behindProxy.
 * `envHost` (CADDY_HOST) sert quand rien n'a jamais été enregistré.
 */
export function resolveCaddyConfig(saved: Record<string, unknown>, envHost = ''): CaddyConfig {
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const mode = saved.mode
  if (mode === 'http' || mode === 'https' || mode === 'proxy') {
    return {
      mode,
      host: str(saved.host),
      keepHttpFallback: saved.keepHttpFallback !== false,
      trustedProxies: str(saved.trustedProxies),
    }
  }
  const host = str(saved.host) || envHost.trim()
  if (isDomainName(host)) return { ...DEFAULT_CADDY_CONFIG, mode: 'https', host }
  return { ...DEFAULT_CADDY_CONFIG, mode: saved.behindProxy === true ? 'proxy' : 'http' }
}

export type CaddyConfigError = 'invalid_domain' | 'invalid_proxy'

/** Valide et normalise une configuration saisie dans l'admin. */
export function normalizeCaddyConfig(input: {
  mode: AccessMode
  host?: string
  keepHttpFallback?: boolean
  trustedProxies?: string
}): { config: CaddyConfig } | { error: CaddyConfigError } {
  const host = (input.host ?? '').trim().toLowerCase()
  if (input.mode === 'https' && !isDomainName(host)) return { error: 'invalid_domain' }
  const trusted = input.mode === 'proxy' ? cleanTrustedProxies(input.trustedProxies ?? '') : ''
  if (trusted === null) return { error: 'invalid_proxy' }
  return {
    config: {
      mode: input.mode,
      host: input.mode === 'https' ? host : '',
      keepHttpFallback: input.keepHttpFallback !== false,
      trustedProxies: trusted,
    },
  }
}

/**
 * Caddyfile correspondant à la configuration.
 * Les proxys du réseau privé (+ ceux déclarés) sont de confiance : Caddy transmet alors
 * leurs en-têtes X-Forwarded-* à l'application, qui en déduit son adresse publique.
 */
export function generateCaddyfile(config: CaddyConfig): string {
  const trusted = ['private_ranges', config.trustedProxies].filter(Boolean).join(' ')
  const proxy = (): string[] => [
    '    request_body {',
    '        max_size 50MB',
    '    }',
    '    reverse_proxy app:3000 {',
    '        header_up X-Real-IP {remote_host}',
    '    }',
  ]
  const lines = [
    '{',
    '  admin 0.0.0.0:2019',
    '  servers {',
    `    trusted_proxies static ${trusted}`,
    '  }',
    '}',
    '',
  ]
  if (config.mode === 'https') {
    lines.push(`${config.host} {`, '    encode gzip', ...proxy(), '}')
    if (config.keepHttpFallback) lines.push('', ':80 {', ...proxy(), '}')
  } else {
    lines.push(':80 {')
    if (config.mode === 'http') lines.push('    encode gzip')
    lines.push(...proxy(), '}')
  }
  return lines.join('\n')
}

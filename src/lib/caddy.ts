import 'server-only'

// Configuration d'accès partagée avec le client : voir caddy-config.ts
export {
  DEFAULT_CADDY_CONFIG,
  generateCaddyfile,
  resolveCaddyConfig,
  normalizeCaddyConfig,
  isDomainName,
} from './caddy-config'
export type { CaddyConfig, AccessMode, CaddyConfigError } from './caddy-config'

/** Recharge Caddy à chaud via son API d'administration (réseau Docker interne uniquement). */
export async function reloadCaddy(content: string): Promise<void> {
  const res = await fetch('http://caddy:2019/load', {
    method: 'POST',
    headers: { 'Content-Type': 'text/caddyfile' },
    body: content,
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) {
    const msg = await res.text().catch(() => String(res.status))
    throw new Error(msg)
  }
}

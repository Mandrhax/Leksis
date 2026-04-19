import 'server-only'

export interface CaddyConfig {
  host: string
  behindProxy: boolean
  nextauthUrl?: string
}

export const DEFAULT_CADDY_CONFIG: CaddyConfig = {
  host: ':80',
  behindProxy: true,
}

export function generateCaddyfile(config: CaddyConfig): string {
  const lines = [
    '{',
    '  admin 0.0.0.0:2019',
    '}',
    '',
    `${config.host} {`,
  ]
  if (!config.behindProxy) lines.push('    encode gzip')
  lines.push('    reverse_proxy app:3000 {')
  lines.push('        header_up X-Real-IP {remote_host}')
  lines.push('    }')
  lines.push('}')
  return lines.join('\n')
}

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

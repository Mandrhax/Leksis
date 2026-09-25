import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-guard'
import { getSetting } from '@/lib/settings'
import { resolveCaddyConfig } from '@/lib/caddy-config'
import type { AccessMode } from '@/lib/caddy-config'
import { checkCertificate } from '@/lib/caddy-tls'
import type { TlsInfo } from '@/lib/caddy-tls'

export interface CaddyUpstream {
  address: string
  healthy: boolean
  numRequests: number
}

export interface CaddyMetricsResult {
  reachable: boolean
  version?: string
  upstreams?: CaddyUpstream[]
  /** Mode d'accès configuré (http / https / proxy) */
  mode?: AccessMode
  /** Mode https : domaine et certificat présenté par Caddy */
  domain?: string
  tls?: TlsInfo
  error?: string
}

export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const result: CaddyMetricsResult = { reachable: false }

  try {
    const [infoRes, upstreamsRes] = await Promise.allSettled([
      fetch('http://caddy:2019/config/', { signal: AbortSignal.timeout(3000) }),
      fetch('http://caddy:2019/reverse_proxy/upstreams', { signal: AbortSignal.timeout(3000) }),
    ])

    if (infoRes.status === 'fulfilled') {
      // Any HTTP response (including 404) means the admin API is reachable
      result.reachable = true

      // Try to read version from the Server header on the proxy port
      try {
        const headRes = await fetch('http://caddy:80/', {
          method: 'HEAD',
          signal: AbortSignal.timeout(2000),
        }).catch(() => null)
        const serverHeader = headRes?.headers.get('server') ?? ''
        // Header is "Caddy/2.8.4" or just "Caddy"
        const match = serverHeader.match(/Caddy\/?([\d.]+)/i)
        if (match) result.version = match[1]
        else if (serverHeader.toLowerCase().includes('caddy')) result.version = 'Caddy'
      } catch {
        // version stays undefined — not critical
      }
    }

    if (upstreamsRes.status === 'fulfilled' && upstreamsRes.value.ok) {
      const raw = await upstreamsRes.value.json().catch(() => [])
      result.upstreams = (Array.isArray(raw) ? raw : []).map((u: Record<string, unknown>) => ({
        address:     String(u.address ?? ''),
        healthy:     u.healthy !== false,
        numRequests: Number(u.num_requests ?? 0),
      }))
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : 'unreachable'
  }

  // Mode d'accès et, en https, état du certificat
  try {
    const cfg = resolveCaddyConfig(await getSetting<Record<string, unknown>>('caddy_config'), process.env.CADDY_HOST ?? '')
    result.mode = cfg.mode
    if (cfg.mode === 'https') {
      result.domain = cfg.host
      result.tls = await checkCertificate(cfg.host)
    }
  } catch {
    // état d'accès non critique
  }

  return NextResponse.json(result)
}

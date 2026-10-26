import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-guard'
import { getSetting } from '@/lib/settings'
import { resolveCaddyConfig } from '@/lib/caddy-config'
import type { AccessMode } from '@/lib/caddy-config'
import { checkCertificate } from '@/lib/caddy-tls'
import type { TlsInfo } from '@/lib/caddy-tls'
import { CADDY_ADMIN_ORIGIN, CADDY_VERSION } from '@/lib/caddy'

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
    const adminHeaders = { Origin: CADDY_ADMIN_ORIGIN }
    const [infoRes, upstreamsRes] = await Promise.allSettled([
      fetch('http://caddy:2019/config/', { headers: adminHeaders, signal: AbortSignal.timeout(3000) }),
      fetch('http://caddy:2019/reverse_proxy/upstreams', { headers: adminHeaders, signal: AbortSignal.timeout(3000) }),
    ])

    if (infoRes.status === 'fulfilled') {
      // Any HTTP response (including 404) means the admin API is reachable
      result.reachable = true
      result.version = CADDY_VERSION
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

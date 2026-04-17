import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-guard'

export interface CaddyUpstream {
  address: string
  healthy: boolean
  numRequests: number
}

export interface CaddyMetricsResult {
  reachable: boolean
  version?: string
  upstreams?: CaddyUpstream[]
  error?: string
}

export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  const result: CaddyMetricsResult = { reachable: false }

  try {
    const [infoRes, upstreamsRes] = await Promise.allSettled([
      fetch('http://caddy:2019/', { signal: AbortSignal.timeout(3000) }),
      fetch('http://caddy:2019/reverse_proxy/upstreams', { signal: AbortSignal.timeout(3000) }),
    ])

    if (infoRes.status === 'fulfilled' && infoRes.value.ok) {
      result.reachable = true
      const info = await infoRes.value.json().catch(() => ({}))
      result.version = info.version as string | undefined
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

  return NextResponse.json(result)
}

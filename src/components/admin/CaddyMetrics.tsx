'use client'

import { useState, useEffect, useCallback } from 'react'
import { useI18n } from '@/lib/i18n'
import type { CaddyMetricsResult } from '@/app/api/admin/services/caddy/metrics/route'

const CARD = 'bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-6'

export function CaddyStatusStrip() {
  const [data,    setData]    = useState<CaddyMetricsResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await fetch('/api/admin/services/caddy/metrics')
      if (!res.ok) throw new Error()
      setData(await res.json())
    } catch {
      setError(true)
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const ok = !error && data?.reachable === true

  return (
    <div className={`flex items-center gap-6 px-5 py-3 rounded-xl border mb-6 ${
      ok
        ? 'bg-[rgba(39,174,96,0.05)] border-[rgba(39,174,96,0.2)]'
        : 'bg-error/5 border-error/20'
    }`}>
      {!ok && (
        <span className="material-symbols-outlined text-error text-[1.1rem] leading-none" aria-hidden="true">warning</span>
      )}
      {ok && data ? (
        <>
          {data.version && (
            <span className="text-sm text-on-surface-variant">
              Version: <span className="font-semibold text-on-surface">{data.version}</span>
            </span>
          )}
          <span className="text-sm text-on-surface-variant">
            Status: <span className="font-semibold text-[#27ae60]">Reachable</span>
          </span>
          {(data.upstreams ?? []).length > 0 && (
            <span className="text-sm text-on-surface-variant">
              Upstreams: <span className="font-semibold text-on-surface">{data.upstreams!.filter(u => u.healthy).length} / {data.upstreams!.length} healthy</span>
            </span>
          )}
        </>
      ) : (
        <span className="text-sm font-medium text-error">Caddy unreachable — check configuration</span>
      )}
      <button
        type="button"
        onClick={load}
        disabled={loading}
        className="ml-auto action-btn"
      >
        <span className={`material-symbols-outlined text-[0.9rem] leading-none${loading ? ' animate-spin' : ''}`} aria-hidden="true">
          refresh
        </span>
        Refresh
      </button>
    </div>
  )
}

export function CaddyMetrics() {
  const { t } = useI18n()
  const [data,      setData]      = useState<CaddyMetricsResult | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(false)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await fetch('/api/admin/services/caddy/metrics')
      if (!res.ok) throw new Error()
      const json = await res.json()
      setData(json)
      setUpdatedAt(new Date())
    } catch {
      setError(true)
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const cf = t.caddyForm

  return (
    <div className="flex flex-col gap-4">
      {loading && !data && (
        <p className="text-sm text-on-surface-variant py-4">{cf.metricsLoading}</p>
      )}

      {error && !loading && (
        <div className={`${CARD} flex items-center gap-3`}>
          <span className="material-symbols-outlined text-error text-[20px]">warning</span>
          <p className="text-sm text-on-surface-variant">{cf.metricsOffline}</p>
        </div>
      )}

      {data && (
        <>
          {/* Bloc 1 — Caddy status (full width) */}
          <div className={`${CARD} flex flex-col gap-4`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${data.reachable ? 'bg-green-500' : 'bg-red-500'}`} />
                <h3 className="text-sm font-semibold text-on-surface">{cf.blockStatus}</h3>
              </div>
              <button
                onClick={load}
                disabled={loading}
                className="icon-btn"
                title={cf.metricsRefresh}
              >
                <span className={`material-symbols-outlined text-[20px]${loading ? ' animate-spin' : ''}`}>
                  refresh
                </span>
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-on-surface-variant mb-0.5">{cf.blockStatusVersion}</p>
                <p className="text-sm font-medium text-on-surface">{data.version ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-on-surface-variant mb-0.5">{cf.blockStatusUpdated}</p>
                <p className="text-sm font-medium text-on-surface">
                  {updatedAt ? updatedAt.toLocaleTimeString() : '—'}
                </p>
              </div>
            </div>

            {!data.reachable && (
              <p className="text-xs text-on-surface-variant">{cf.metricsOffline}</p>
            )}
          </div>

          {/* Bloc 2 — Upstream */}
          {data.upstreams && data.upstreams.length > 0 && (
            <div className={`${CARD} flex flex-col gap-4`}>
              <h3 className="text-sm font-semibold text-on-surface">{cf.blockUpstream}</h3>

              <div className="flex flex-col gap-1">
                <div className="grid grid-cols-[1fr_auto_auto] gap-4 pb-1.5 border-b border-outline-variant/20 text-xs font-medium text-on-surface-variant">
                  <span>Address</span>
                  <span className="text-right">{cf.blockUpstreamRequests}</span>
                  <span className="text-right w-20">Status</span>
                </div>

                {data.upstreams.map(u => (
                  <div
                    key={u.address}
                    className="grid grid-cols-[1fr_auto_auto] gap-4 py-1.5 border-b border-outline-variant/10 last:border-0 text-sm"
                  >
                    <span className="text-on-surface font-mono text-xs">{u.address}</span>
                    <span className="text-right text-on-surface-variant">{u.numRequests}</span>
                    <span className={`text-right w-20 text-xs font-medium ${u.healthy ? 'text-green-600' : 'text-error'}`}>
                      {u.healthy ? cf.blockUpstreamHealthy : cf.blockUpstreamUnhealthy}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

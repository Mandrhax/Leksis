'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useI18n } from '@/lib/i18n'
import type { CaddyMetricsResult } from '@/app/api/admin/services/caddy/metrics/route'
import { CADDY_SAVED_EVENT } from './CaddyServiceForm'

const CARD = 'bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-6'

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

  // Après une sauvegarde : relire l'état, puis surveiller l'émission du certificat (3 min max)
  const polls = useRef(0)
  useEffect(() => {
    const onSaved = () => { polls.current = 0; setTimeout(load, 1500) }
    window.addEventListener(CADDY_SAVED_EVENT, onSaved)
    return () => window.removeEventListener(CADDY_SAVED_EVENT, onSaved)
  }, [load])
  useEffect(() => {
    if (data?.mode !== 'https' || !data.tls || data.tls.ok || polls.current >= 36) return
    polls.current += 1
    const id = setTimeout(load, 5000)
    return () => clearTimeout(id)
  }, [data, load])

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

          {/* Bloc access — mode d'accès et certificat HTTPS */}
          {data.mode && (
            <div className={`${CARD} flex flex-col gap-3`}>
              <h3 className="text-sm font-semibold text-on-surface">{cf.blockAccess}</h3>
              <p className="text-sm text-on-surface">
                {data.mode === 'https' ? cf.modeHttps : data.mode === 'proxy' ? cf.modeProxy : cf.modeHttp}
                {data.domain && <span className="font-mono text-xs text-on-surface-variant"> — {data.domain}</span>}
              </p>
              {data.mode === 'https' && data.tls && (
                data.tls.ok ? (
                  <p className="text-xs flex items-start gap-1.5 text-green-600">
                    <span className="material-symbols-outlined text-[16px]" aria-hidden="true">verified_user</span>
                    <span>
                      {cf.certOk
                        .replace('{0}', data.tls.issuer ?? '—')
                        .replace('{1}', data.tls.validTo ? new Date(data.tls.validTo).toLocaleDateString() : '—')}
                    </span>
                  </p>
                ) : (
                  <p className="text-xs flex items-start gap-1.5 text-on-surface-variant">
                    <span className="material-symbols-outlined text-[16px] animate-pulse" aria-hidden="true">hourglass_top</span>
                    <span>{cf.certPending.replace('{0}', data.domain ?? '')}</span>
                  </p>
                )
              )}
            </div>
          )}

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

'use client'

import { useState, useEffect, useCallback } from 'react'
import { useI18n } from '@/lib/i18n'
import type { DbMetricsResult } from '@/app/api/admin/services/db/metrics/route'

// Fixed display order — tables absent from pg_stat_user_tables show "—"
const KNOWN_TABLES = [
  'users',
  'sessions',
  'accounts',
  'otp_tokens',
  'verification_token',
  'site_settings',
  'audit_log',
  'usage_log',
  'glossaries',
  'glossary_entries',
  'user_glossary_prefs',
]

function formatUptime(startedAt: string): string {
  const diff = Math.max(0, Date.now() - new Date(startedAt).getTime())
  const totalMins  = Math.floor(diff / 60000)
  const days  = Math.floor(totalMins / 1440)
  const hours = Math.floor((totalMins % 1440) / 60)
  const mins  = totalMins % 60
  if (days > 0)  return `${days}d ${hours}h ${mins}m`
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}

const CARD = 'bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-6'

export function DbStatusStrip() {
  const [data,    setData]    = useState<DbMetricsResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await fetch('/api/admin/services/db/metrics')
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

  const ok = !error && data != null

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
          <span className="text-sm text-on-surface-variant">
            Version: <span className="font-semibold text-on-surface">{data.version?.replace('PostgreSQL ', '').split(' ')[0]}</span>
          </span>
          <span className="text-sm text-on-surface-variant">
            Size: <span className="font-semibold text-on-surface">{data.dbSizePretty}</span>
          </span>
          <span className="text-sm text-on-surface-variant">
            Uptime: <span className="font-semibold text-on-surface">{formatUptime(data.serverStartedAt)}</span>
          </span>
          <span className="text-sm text-on-surface-variant">
            Connections: <span className="font-semibold text-on-surface">{data.activeConnections} / {data.maxConnections}</span>
          </span>
        </>
      ) : (
        <span className="text-sm font-medium text-error">PostgreSQL unreachable — check configuration</span>
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

export function DbMetrics() {
  const { t } = useI18n()
  const [data,      setData]      = useState<DbMetricsResult | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(false)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await fetch('/api/admin/services/db/metrics')
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

  const df = t.dbForm

  return (
    <div className="flex flex-col gap-4">
      {/* Loading */}
      {loading && !data && (
        <p className="text-sm text-on-surface-variant py-4">{df.metricsLoading}</p>
      )}

      {/* Error */}
      {error && !loading && (
        <div className={`${CARD} flex items-center gap-3`}>
          <span className="material-symbols-outlined text-error text-[20px]">warning</span>
          <p className="text-sm text-on-surface-variant">{df.metricsLoading}</p>
        </div>
      )}

      {data && (
        <>
          {/* Bloc 1 — Server status (full width) — refresh button in header */}
          <div className={`${CARD} flex flex-col gap-4`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                <h3 className="text-sm font-semibold text-on-surface">{df.blockStatus}</h3>
              </div>
              <button
                onClick={load}
                disabled={loading}
                className="icon-btn"
                title={df.metricsRefresh}
              >
                <span className={`material-symbols-outlined text-[20px]${loading ? ' animate-spin' : ''}`}>
                  refresh
                </span>
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-on-surface-variant mb-0.5">{df.blockStatusVersion}</p>
                <p className="text-sm font-medium text-on-surface">{data.version}</p>
              </div>
              <div>
                <p className="text-xs text-on-surface-variant mb-0.5">{df.blockStatusSize}</p>
                <p className="text-sm font-medium text-on-surface">{data.dbSizePretty}</p>
              </div>
              <div>
                <p className="text-xs text-on-surface-variant mb-0.5">{df.blockStatusUptime}</p>
                <p className="text-sm font-medium text-on-surface">{formatUptime(data.serverStartedAt)}</p>
              </div>
              <div>
                <p className="text-xs text-on-surface-variant mb-0.5">{df.blockStatusUpdated}</p>
                <p className="text-sm font-medium text-on-surface">
                  {updatedAt ? updatedAt.toLocaleTimeString() : '—'}
                </p>
              </div>
            </div>
          </div>

          {/* Blocs 2 + 3 — side by side */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {/* Bloc 2 — Connections */}
            <div className={`${CARD} flex flex-col gap-4`}>
              <h3 className="text-sm font-semibold text-on-surface">{df.blockConnections}</h3>

              <div className="grid grid-cols-4 gap-4">
                {[
                  { label: df.blockConnectionsActive, value: data.activeConnections },
                  { label: df.blockConnectionsIdle,   value: data.idleConnections   },
                  { label: df.blockConnectionsTotal,  value: data.totalConnections  },
                  { label: df.blockConnectionsMax,    value: data.maxConnections    },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-xs text-on-surface-variant mb-0.5">{label}</p>
                    <p className="text-sm font-medium text-on-surface">{value}</p>
                  </div>
                ))}
              </div>

              {/* Usage bar */}
              <div>
                <div className="flex justify-between text-xs text-on-surface-variant mb-1">
                  <span>{df.blockConnectionsUsage}</span>
                  <span>
                    {Math.min(100, Math.round(data.totalConnections / data.maxConnections * 100))}%
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-outline-variant/20 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary/60 transition-all"
                    style={{ width: `${Math.min(100, Math.round(data.totalConnections / data.maxConnections * 100))}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Bloc 3 — Tables */}
            <div className={`${CARD} flex flex-col gap-4`}>
              <h3 className="text-sm font-semibold text-on-surface">{df.blockTables}</h3>

              <div className="flex flex-col gap-1">
                {/* Header row */}
                <div className="grid grid-cols-[1fr_auto_auto] gap-4 pb-1.5 border-b border-outline-variant/20 text-xs font-medium text-on-surface-variant">
                  <span>Table</span>
                  <span className="text-right">{df.blockTablesRows}</span>
                  <span className="text-right w-16">{df.blockTablesSize}</span>
                </div>

                {/* Data rows — fixed order, missing tables show "—" */}
                {KNOWN_TABLES.map(name => {
                  const row = data.tables.find(r => r.tableName === name)
                  return (
                    <div
                      key={name}
                      className="grid grid-cols-[1fr_auto_auto] gap-4 py-1.5 border-b border-outline-variant/10 last:border-0 text-sm"
                    >
                      <span className="text-on-surface font-mono text-xs">{name}</span>
                      <span className="text-right text-on-surface-variant">
                        {row ? row.rowCount.toLocaleString() : '—'}
                      </span>
                      <span className="text-right text-on-surface-variant w-16">
                        {row ? row.sizePretty : '—'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

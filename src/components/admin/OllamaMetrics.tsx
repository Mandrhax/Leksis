'use client'

import { useState, useEffect, useCallback, createContext, useContext } from 'react'
import { useI18n } from '@/lib/i18n'
import type { OllamaMetricsResult } from '@/app/api/admin/services/ollama/metrics/route'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

function formatExpiry(isoDate: string): string {
  if (!isoDate) return '—'
  const diff = Math.max(0, new Date(isoDate).getTime() - Date.now())
  const mins = Math.floor(diff / 60000)
  const secs = Math.floor((diff % 60000) / 1000)
  if (mins > 0) return `${mins}m ${secs}s`
  return `${secs}s`
}

interface OllamaMetricsCtx {
  data:       OllamaMetricsResult | null
  loading:    boolean
  error:      boolean
  updatedAt:  Date | null
  unloading:  string | null
  load:       () => void
  handleUnload: (model: string) => void
}

const OllamaCtx = createContext<OllamaMetricsCtx | null>(null)

function useOllamaMetrics() {
  const ctx = useContext(OllamaCtx)
  if (!ctx) throw new Error('useOllamaMetrics must be used inside OllamaMetricsProvider')
  return ctx
}

export function OllamaMetricsProvider({ children }: { children: React.ReactNode }) {
  const [data,      setData]      = useState<OllamaMetricsResult | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(false)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [unloading, setUnloading] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await fetch('/api/admin/services/ollama/metrics')
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

  async function handleUnload(model: string) {
    setUnloading(model)
    try {
      await fetch('/api/admin/services/ollama/unload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
      })
      await load()
    } finally {
      setUnloading(null)
    }
  }

  return (
    <OllamaCtx.Provider value={{ data, loading, error, updatedAt, unloading, load, handleUnload }}>
      {children}
    </OllamaCtx.Provider>
  )
}

export function OllamaStatusBlock() {
  const { t } = useI18n()
  const { data, loading, error, updatedAt, load } = useOllamaMetrics()
  const of = t.ollamaForm

  if (loading && !data) return (
    <p className="text-sm text-on-surface-variant py-4">{of.metricsLoading}</p>
  )

  if (error && !loading) return (
    <div className="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-6 flex items-center gap-3">
      <span className="material-symbols-outlined text-error text-[20px]">warning</span>
      <p className="text-sm text-on-surface-variant">{of.metricsOffline}</p>
    </div>
  )

  if (!data) return null

  return (
    <div className="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-6 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${data.version ? 'bg-green-500' : 'bg-red-500'}`} />
          <h3 className="text-sm font-semibold text-on-surface">{of.blockStatus}</h3>
        </div>
        <button onClick={load} disabled={loading} className="icon-btn" title={of.metricsRefresh}>
          <span className={`material-symbols-outlined text-[20px]${loading ? ' animate-spin' : ''}`}>
            refresh
          </span>
        </button>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <p className="text-xs text-on-surface-variant mb-0.5">{of.blockStatusVersion}</p>
          <p className="text-sm font-medium text-on-surface">{data.version || '—'}</p>
        </div>
        <div>
          <p className="text-xs text-on-surface-variant mb-0.5">{of.blockStatusLatency}</p>
          <p className="text-sm font-medium text-on-surface">{data.latencyMs} ms</p>
        </div>
        <div>
          <p className="text-xs text-on-surface-variant mb-0.5">{of.blockStatusUpdated}</p>
          <p className="text-sm font-medium text-on-surface">
            {updatedAt ? updatedAt.toLocaleTimeString() : '—'}
          </p>
        </div>
      </div>
    </div>
  )
}

export function OllamaInstalledBlock() {
  const { t } = useI18n()
  const { data } = useOllamaMetrics()
  const of = t.ollamaForm

  if (!data) return null

  return (
    <div className="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-6 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-on-surface">{of.blockModels}</h3>
        <span className="text-xs text-on-surface-variant">
          {of.blockModelsTotal.replace('{0}', String(data.models.length))}
        </span>
      </div>

      {data.models.length === 0 ? (
        <p className="text-sm text-on-surface-variant">—</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {data.models.map(m => {
            const isConfigured = data.configuredModels.includes(m.name)
            return (
              <div
                key={m.name}
                className="flex items-center justify-between py-1.5 border-b border-outline-variant/10 last:border-0"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm text-on-surface truncate">{m.name}</span>
                  {isConfigured && (
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                      {of.blockModelsConfigured}
                    </span>
                  )}
                </div>
                <span className="text-xs text-on-surface-variant shrink-0 ml-4">
                  {formatBytes(m.size)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function OllamaRunningBlock() {
  const { t } = useI18n()
  const { data, unloading, handleUnload } = useOllamaMetrics()
  const of = t.ollamaForm

  if (!data) return null

  return (
    <div className="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-6 flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-on-surface">{of.blockRunning}</h3>

      {data.running.length === 0 ? (
        <p className="text-sm text-on-surface-variant">{of.blockRunningEmpty}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {data.running.map(m => (
            <div
              key={m.name}
              className="rounded-lg border border-outline-variant/15 bg-surface-container-low p-3 flex flex-col gap-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-on-surface truncate">{m.name}</span>
                <button
                  onClick={() => handleUnload(m.name)}
                  disabled={unloading === m.name}
                  className="text-button shrink-0 text-xs"
                >
                  {unloading === m.name ? of.actionUnloading : of.actionUnload}
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs text-on-surface-variant">
                <div>
                  <span className="font-medium">{of.blockRunningVram}</span>
                  <br />
                  {formatBytes(m.sizeVram)}
                </div>
                <div>
                  <span className="font-medium">{of.blockRunningRam}</span>
                  <br />
                  {formatBytes(m.size)}
                </div>
                <div>
                  <span className="font-medium">{of.blockRunningExpires}</span>
                  <br />
                  {formatExpiry(m.expiresAt)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function OllamaMetrics() {
  return (
    <OllamaMetricsProvider>
      <div className="flex flex-col gap-4">
        <OllamaStatusBlock />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <OllamaInstalledBlock />
          <OllamaRunningBlock />
        </div>
      </div>
    </OllamaMetricsProvider>
  )
}

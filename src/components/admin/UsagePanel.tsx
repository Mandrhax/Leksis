'use client'

import { useState, useEffect } from 'react'
import { PurgeButton } from './PurgeButton'
import { useI18n } from '@/lib/i18n'

interface UsageSummary {
  total:      number
  byFeature:  Record<string, number>
  byLang:     Record<string, number>
  byModel:    Record<string, number>
  rows:       UsageRow[]
}

interface UsageRow {
  id:          string
  user_email:  string
  feature:     string
  source_lang: string | null
  target_lang: string | null
  model:       string | null
  char_count:  number | null
  created_at:  string
}

function toInputDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

export function UsagePanel() {
  const { t } = useI18n()

  const FEATURE_LABELS: Record<string, string> = {
    text:     t.usagePanel.featureText,
    document: t.usagePanel.featureDoc,
    image:    t.usagePanel.featureImage,
    rewrite:  t.usagePanel.featureRew,
  }

  const today   = new Date()
  const oneWeek = new Date(today.getTime() - 7 * 24 * 3600 * 1000)

  const [from, setFrom]     = useState(toInputDate(oneWeek))
  const [to, setTo]         = useState(toInputDate(today))
  const [data, setData]     = useState<UsageSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ from, to })
      const res = await fetch(`/api/admin/usage?${params}`)
      if (!res.ok) throw new Error()
      setData(await res.json())
    } catch {
      setError(t.usagePanel.errorLoad)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleExport() {
    const params = new URLSearchParams({ from, to, format: 'csv' })
    window.open(`/api/admin/usage?${params}`, '_blank')
  }

  return (
    <div className="space-y-6">

      {/* Filtres */}
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-xs text-on-surface-variant mb-1">{t.usagePanel.fromLabel}</label>
          <input
            type="date"
            value={from}
            onChange={e => setFrom(e.target.value)}
            className="bg-surface-container border border-outline-variant/20 rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary/50"
          />
        </div>
        <div>
          <label className="block text-xs text-on-surface-variant mb-1">{t.usagePanel.toLabel}</label>
          <input
            type="date"
            value={to}
            onChange={e => setTo(e.target.value)}
            className="bg-surface-container border border-outline-variant/20 rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary/50"
          />
        </div>
        <button onClick={load} disabled={loading} className="action-btn disabled:opacity-40">
          {loading ? (
            <span className="material-symbols-outlined animate-spin text-base leading-none" aria-hidden="true">progress_activity</span>
          ) : (
            <span className="material-symbols-outlined text-base leading-none" aria-hidden="true">search</span>
          )}
          {t.usagePanel.filter}
        </button>
        <div className="flex-1" />
        <button onClick={handleExport} className="text-button">
          <span className="material-symbols-outlined text-base leading-none" aria-hidden="true">download</span>
          {t.usagePanel.exportCsv}
        </button>
        <PurgeButton
          endpoint="/api/admin/usage/purge"
          label={t.usagePanel.purgeLabel}
          onSuccess={load}
        />
      </div>

      {error && (
        <p className="text-sm text-error">{error}</p>
      )}

      {data && (
        <>
          {/* Résumé */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Object.entries(data.byFeature).map(([feature, count]) => (
              <div key={feature} className="bg-surface-container-lowest border border-outline-variant/20 rounded-xl p-4">
                <p className="text-xs text-on-surface-variant mb-1">{FEATURE_LABELS[feature] ?? feature}</p>
                <p className="text-2xl font-bold text-on-surface">{count}</p>
              </div>
            ))}
          </div>

          {/* Top langues cibles */}
          {Object.keys(data.byLang).length > 0 && (
            <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-on-surface mb-3">{t.usagePanel.topLangs}</h3>
              <div className="flex flex-wrap gap-2">
                {Object.entries(data.byLang)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 10)
                  .map(([lang, count]) => (
                    <span key={lang} className="inline-flex items-center gap-1.5 text-xs bg-surface-container px-2.5 py-1 rounded-full text-on-surface-variant">
                      <span className="font-medium text-on-surface">{lang}</span> {count}
                    </span>
                  ))}
              </div>
            </div>
          )}

          {/* Top modèles */}
          {Object.keys(data.byModel).length > 0 && (
            <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-on-surface mb-3">{t.usagePanel.topModels}</h3>
              <div className="flex flex-wrap gap-2">
                {Object.entries(data.byModel)
                  .sort((a, b) => b[1] - a[1])
                  .map(([model, count]) => (
                    <span key={model} className="inline-flex items-center gap-1.5 text-xs bg-surface-container px-2.5 py-1 rounded-full text-on-surface-variant font-mono">
                      {model} <span className="font-sans font-medium text-on-surface">×{count}</span>
                    </span>
                  ))}
              </div>
            </div>
          )}

          {/* Tableau détail */}
          <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-outline-variant/10 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-on-surface">{t.usagePanel.lastCalls}</h3>
              <span className="text-xs text-on-surface-variant">
                {t.usagePanel.totalSuffix.replace('{0}', String(data.total)).replace('{1}', String(data.rows.length))}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-outline-variant/10 text-left text-on-surface-variant">
                    <th className="px-4 py-2.5 font-medium">{t.usagePanel.colDate}</th>
                    <th className="px-4 py-2.5 font-medium">{t.usagePanel.colUser}</th>
                    <th className="px-4 py-2.5 font-medium">{t.usagePanel.colFeature}</th>
                    <th className="px-4 py-2.5 font-medium">{t.usagePanel.colLangs}</th>
                    <th className="px-4 py-2.5 font-medium">{t.usagePanel.colModel}</th>
                    <th className="px-4 py-2.5 font-medium text-right">{t.usagePanel.colChars}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map(row => (
                    <tr key={row.id} className="border-b border-outline-variant/10 hover:bg-surface-container/50 transition-colors">
                      <td className="px-4 py-2.5 text-on-surface-variant whitespace-nowrap">
                        {new Date(row.created_at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="px-4 py-2.5 text-on-surface max-w-[160px] truncate">{row.user_email}</td>
                      <td className="px-4 py-2.5">
                        <span className="inline-block bg-surface-container px-2 py-0.5 rounded text-on-surface-variant">
                          {FEATURE_LABELS[row.feature] ?? row.feature}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-on-surface-variant">
                        {row.source_lang && row.target_lang
                          ? `${row.source_lang} → ${row.target_lang}`
                          : row.source_lang ?? row.target_lang ?? '—'}
                      </td>
                      <td className="px-4 py-2.5 text-on-surface-variant font-mono truncate max-w-[160px]">{row.model ?? '—'}</td>
                      <td className="px-4 py-2.5 text-on-surface-variant text-right">{row.char_count?.toLocaleString() ?? '—'}</td>
                    </tr>
                  ))}
                  {data.rows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-on-surface-variant">
                        {t.usagePanel.noData}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

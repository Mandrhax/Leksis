'use client'

import { useState } from 'react'
import { useI18n } from '@/lib/i18n'

interface PurgeButtonProps {
  endpoint: string          // ex: '/api/admin/usage/purge'
  label: string             // ex: 'Utilisation' | 'Journal'
  onSuccess?: () => void    // callback pour rafraîchir le parent
}

function toInputDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

export function PurgeButton({ endpoint, label, onSuccess }: PurgeButtonProps) {
  const { t } = useI18n()
  const defaultDate = toInputDate(new Date(Date.now() - 30 * 24 * 3600 * 1000)) // -30j

  const [open, setOpen]         = useState(false)
  const [before, setBefore]     = useState(defaultDate)
  const [loading, setLoading]   = useState(false)
  const [result, setResult]     = useState<{ deleted: number } | null>(null)
  const [error, setError]       = useState<string | null>(null)

  function handleOpen() {
    setOpen(true)
    setResult(null)
    setError(null)
  }

  function handleCancel() {
    setOpen(false)
    setResult(null)
    setError(null)
  }

  async function handlePurge() {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const params = new URLSearchParams({ before })
      const res = await fetch(`${endpoint}?${params}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? t.purgeButton.errorUnknown)
      }
      const json = await res.json()
      setResult(json)
      onSuccess?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : t.purgeButton.errorUnknown)
    } finally {
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <button onClick={handleOpen} className="text-button text-error/80 hover:text-error">
        <span className="material-symbols-outlined text-base leading-none" aria-hidden="true">delete_sweep</span>
        {t.purgeButton.purge}
      </button>
    )
  }

  return (
    <div className="flex flex-wrap items-end gap-3 bg-error/5 border border-error/20 rounded-xl px-4 py-3">
      <div>
        <label className="block text-xs text-on-surface-variant mb-1">
          {t.purgeButton.deleteBefore}
        </label>
        <input
          type="date"
          value={before}
          onChange={e => setBefore(e.target.value)}
          max={toInputDate(new Date())}
          className="bg-surface-container border border-outline-variant/20 rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-error/50"
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handlePurge}
          disabled={loading || !before}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-error text-white disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          {loading ? (
            <span className="material-symbols-outlined animate-spin text-base leading-none" aria-hidden="true">progress_activity</span>
          ) : (
            <span className="material-symbols-outlined text-base leading-none" aria-hidden="true">delete_forever</span>
          )}
          {t.purgeButton.confirmPurge}
        </button>
        <button onClick={handleCancel} disabled={loading} className="text-button">
          {t.purgeButton.cancel}
        </button>
      </div>

      {result !== null && (
        <p className="w-full text-xs text-on-surface-variant">
          <span className="material-symbols-outlined text-sm leading-none align-middle text-primary mr-1" aria-hidden="true">check_circle</span>
          {result.deleted === 0
            ? t.purgeButton.purgeNothingToDelete.replace('{0}', label).replace('{1}', before)
            : t.purgeButton.purgeDeletedSome.replace('{0}', String(result.deleted)).replace('{1}', label)}
        </p>
      )}

      {error && (
        <p className="w-full text-xs text-error">
          <span className="material-symbols-outlined text-sm leading-none align-middle mr-1" aria-hidden="true">error</span>
          {error}
        </p>
      )}
    </div>
  )
}

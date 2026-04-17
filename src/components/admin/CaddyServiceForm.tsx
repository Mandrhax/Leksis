'use client'

import { useState, useMemo } from 'react'
import type { ToastState } from './AdminToast'
import { useI18n } from '@/lib/i18n'

interface CaddyData {
  host: string
  behindProxy: boolean
}

interface Props {
  initial: Partial<CaddyData>
  onToast: (t: ToastState) => void
}

function buildPreview(host: string, behindProxy: boolean): string {
  const lines = ['{', '  admin 0.0.0.0:2019', '}', '', `${host || ':80'} {`]
  if (!behindProxy) lines.push('    encode gzip')
  lines.push('    reverse_proxy app:3000 {')
  lines.push('        header_up X-Real-IP {remote_host}')
  lines.push('    }')
  lines.push('}')
  return lines.join('\n')
}

export function CaddyServiceForm({ initial, onToast }: Props) {
  const { t } = useI18n()
  const cf = t.caddyForm

  const [data, setData] = useState<CaddyData>({
    host:        initial.host        ?? ':80',
    behindProxy: initial.behindProxy ?? true,
  })
  const [saving, setSaving] = useState(false)

  const preview = useMemo(() => buildPreview(data.host, data.behindProxy), [data.host, data.behindProxy])

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/services', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service: 'caddy', host: data.host, behindProxy: data.behindProxy }),
      })
      if (!res.ok) throw new Error()
      const json = await res.json()
      if (json.reloadError) {
        onToast({ message: cf.toastReloadError, type: 'warning' })
      } else {
        onToast({ message: cf.toastSavedReloaded, type: 'success' })
      }
    } catch {
      onToast({ message: cf.toastError, type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full bg-surface-container border border-outline-variant/20 rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary/50'

  return (
    <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-6 space-y-5">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-xl text-on-surface-variant leading-none" aria-hidden="true">router</span>
        <h3 className="font-headline font-semibold text-base text-on-surface">Caddy</h3>
      </div>

      {/* Host */}
      <div>
        <label className="block text-sm text-on-surface mb-1.5">{cf.hostLabel}</label>
        <input
          type="text"
          value={data.host}
          onChange={e => setData(prev => ({ ...prev, host: e.target.value }))}
          className={inputCls}
          placeholder=":80"
          spellCheck={false}
        />
        <p className="text-xs text-on-surface-variant mt-1.5">{cf.hostHint}</p>
      </div>

      {/* Behind proxy toggle */}
      <div>
        <label className="flex items-start gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={data.behindProxy}
            onChange={e => setData(prev => ({ ...prev, behindProxy: e.target.checked }))}
            className="mt-0.5 h-4 w-4 rounded border-outline-variant/40 text-primary accent-primary"
          />
          <div>
            <span className="text-sm text-on-surface">{cf.behindProxyLabel}</span>
            <p className="text-xs text-on-surface-variant mt-0.5">{cf.behindProxyHint}</p>
          </div>
        </label>
      </div>

      {/* Caddyfile preview */}
      <div>
        <p className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-2">{cf.caddyfilePreview}</p>
        <pre className="bg-surface-container rounded-lg border border-outline-variant/20 px-4 py-3 text-xs text-on-surface-variant font-mono leading-relaxed overflow-x-auto whitespace-pre">
          {preview}
        </pre>
      </div>

      {/* Actions */}
      <div className="flex justify-end pt-1">
        <button onClick={handleSave} disabled={saving} className="action-btn disabled:opacity-40">
          {saving ? (
            <span className="material-symbols-outlined animate-spin text-base leading-none" aria-hidden="true">progress_activity</span>
          ) : (
            <span className="material-symbols-outlined text-base leading-none" aria-hidden="true">save</span>
          )}
          {cf.save}
        </button>
      </div>
    </div>
  )
}

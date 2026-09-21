'use client'

import { useMemo, useState } from 'react'
import type { ToastState } from './AdminToast'
import { useI18n } from '@/lib/i18n'
import { generateCaddyfile, isDomainName, cleanTrustedProxies } from '@/lib/caddy-config'
import type { AccessMode, CaddyConfig } from '@/lib/caddy-config'

interface Props {
  initial: CaddyConfig
  onToast: (t: ToastState) => void
}

/** Prévient les blocs de métriques qu'il faut relire l'état (certificat, mode). */
export const CADDY_SAVED_EVENT = 'leksis:caddy-saved'

export function CaddyServiceForm({ initial, onToast }: Props) {
  const { t } = useI18n()
  const cf = t.caddyForm

  const [mode,             setMode]             = useState<AccessMode>(initial.mode)
  const [host,             setHost]             = useState(initial.host)
  const [keepHttpFallback, setKeepHttpFallback] = useState(initial.keepHttpFallback)
  const [trustedProxies,   setTrustedProxies]   = useState(initial.trustedProxies)
  const [saving,           setSaving]           = useState(false)

  const domainOk  = mode !== 'https' || isDomainName(host)
  const proxiesOk = mode !== 'proxy' || cleanTrustedProxies(trustedProxies) !== null

  const preview = useMemo(() => generateCaddyfile({
    mode,
    host: isDomainName(host) ? host.trim().toLowerCase() : 'leksis.example.com',
    keepHttpFallback,
    trustedProxies: mode === 'proxy' ? (cleanTrustedProxies(trustedProxies) ?? '') : '',
  }), [mode, host, keepHttpFallback, trustedProxies])

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/services', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service: 'caddy', mode, host, keepHttpFallback, trustedProxies }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: unknown }
        onToast({
          message: json.error === 'invalid_domain' ? cf.toastInvalidDomain
                 : json.error === 'invalid_proxy'  ? cf.toastInvalidProxy
                 : cf.toastError,
          type: 'error',
        })
        return
      }
      const json = await res.json() as { reloadError?: string }
      if (json.reloadError) {
        onToast({ message: cf.toastReloadError, type: 'warning' })
      } else {
        onToast({ message: cf.toastSavedReloaded, type: 'success' })
      }
      window.dispatchEvent(new Event(CADDY_SAVED_EVENT))
    } catch {
      onToast({ message: cf.toastError, type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full bg-surface-container border border-outline-variant/20 rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary/50'

  const modes: { id: AccessMode; label: string; desc: string; icon: string }[] = [
    { id: 'http',  label: cf.modeHttp,  desc: cf.modeHttpDesc,  icon: 'lan' },
    { id: 'https', label: cf.modeHttps, desc: cf.modeHttpsDesc, icon: 'lock' },
    { id: 'proxy', label: cf.modeProxy, desc: cf.modeProxyDesc, icon: 'swap_horiz' },
  ]

  return (
    <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-6 space-y-5">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-xl text-on-surface-variant leading-none" aria-hidden="true">router</span>
        <h3 className="font-headline font-semibold text-base text-on-surface">{cf.title}</h3>
      </div>

      {/* Mode d'accès */}
      <div>
        <span className="block text-sm text-on-surface mb-1.5">{cf.modeLabel}</span>
        <div className="grid grid-cols-1 gap-3" role="radiogroup" aria-label={cf.modeLabel}>
          {modes.map(m => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={mode === m.id}
              onClick={() => setMode(m.id)}
              className={`flex items-start gap-3 text-left rounded-lg border px-4 py-3 transition-colors ${
                mode === m.id
                  ? 'border-primary bg-primary/5'
                  : 'border-outline-variant/30 hover:border-outline-variant'
              }`}
            >
              <span className="material-symbols-outlined text-xl text-on-surface-variant leading-none mt-0.5" aria-hidden="true">{m.icon}</span>
              <span>
                <span className="block text-sm font-semibold text-on-surface">{m.label}</span>
                <span className="block text-xs text-on-surface-variant mt-0.5">{m.desc}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* HTTPS : nom de domaine */}
      {mode === 'https' && (
        <div className="space-y-4">
          <div>
            <label htmlFor="caddy-domain" className="block text-sm text-on-surface mb-1.5">{cf.domainLabel}</label>
            <input
              id="caddy-domain"
              type="text"
              value={host}
              onChange={e => setHost(e.target.value)}
              className={inputCls}
              placeholder="leksis.example.com"
              spellCheck={false}
              autoComplete="off"
            />
            <p className={`text-xs mt-1.5 ${host && !domainOk ? 'text-error' : 'text-on-surface-variant'}`}>
              {host && !domainOk ? cf.domainInvalid : cf.domainHint}
            </p>
          </div>

          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={keepHttpFallback}
              onChange={e => setKeepHttpFallback(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-outline-variant/40 text-primary accent-primary"
            />
            <span>
              <span className="text-sm text-on-surface">{cf.fallbackLabel}</span>
              <span className="block text-xs text-on-surface-variant mt-0.5">{cf.fallbackHint}</span>
            </span>
          </label>
        </div>
      )}

      {/* Proxy inverse : rappel des réglages + adresses de confiance */}
      {mode === 'proxy' && (
        <div className="space-y-4">
          <p className="text-xs text-on-surface-variant rounded-lg bg-surface-container px-3 py-2.5 leading-relaxed">
            {cf.proxyHint}
          </p>
          <div>
            <label htmlFor="caddy-trusted" className="block text-sm text-on-surface mb-1.5">{cf.trustedLabel}</label>
            <input
              id="caddy-trusted"
              type="text"
              value={trustedProxies}
              onChange={e => setTrustedProxies(e.target.value)}
              className={inputCls}
              placeholder="203.0.113.10"
              spellCheck={false}
              autoComplete="off"
            />
            <p className={`text-xs mt-1.5 ${trustedProxies && !proxiesOk ? 'text-error' : 'text-on-surface-variant'}`}>
              {cf.trustedHint}
            </p>
          </div>
        </div>
      )}

      {/* Caddyfile preview */}
      <div>
        <p className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-2">{cf.caddyfilePreview}</p>
        <pre className="bg-surface-container rounded-lg border border-outline-variant/20 px-4 py-3 text-xs text-on-surface-variant font-mono leading-relaxed overflow-x-auto whitespace-pre">
          {preview}
        </pre>
      </div>

      {/* Actions */}
      <div className="flex justify-end pt-1">
        <button onClick={handleSave} disabled={saving || !domainOk || !proxiesOk} className="action-btn disabled:opacity-40">
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

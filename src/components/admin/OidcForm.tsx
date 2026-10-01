'use client'

import { useEffect, useState } from 'react'
import type { ToastState } from './AdminToast'
import { useI18n } from '@/lib/i18n'
import type { OidcPublicConfig } from '@/lib/auth-methods'
import { useDirtyTracking } from '@/hooks/useDirtyTracking'

interface Data {
  issuer: string
  clientId: string
  buttonLabel: string
  scopes: string
}

interface TestResult {
  ok: boolean
  message?: string
}

interface Props {
  initial: OidcPublicConfig
  onToast: (t: ToastState) => void
  onDirtyChange?: (dirty: boolean) => void
}

export function OidcForm({ initial, onToast, onDirtyChange }: Props) {
  const { t } = useI18n()
  const of = t.oidcForm

  const [data, setData] = useState<Data>({
    issuer:      initial.issuer,
    clientId:    initial.clientId,
    buttonLabel: initial.buttonLabel,
    scopes:      initial.scopes,
  })
  const [clientSecret, setClientSecret] = useState('')
  const [hasClientSecret, setHasClientSecret] = useState(initial.hasClientSecret)
  const [clearClientSecret, setClearClientSecret] = useState(false)
  const [redirectUri, setRedirectUri] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<TestResult | null>(null)
  const { dirty, markSaved } = useDirtyTracking({ data, clientSecret, clearClientSecret })
  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])

  // Calculé côté client (jamais depuis une adresse interne côté serveur) — cohérent avec safeCallbackPath
  useEffect(() => { setRedirectUri(`${window.location.origin}/api/auth/callback/oidc`) }, [])

  function field<K extends keyof Data>(k: K, v: Data[K]) {
    setData(prev => ({ ...prev, [k]: v }))
  }

  const canSave = data.issuer !== '' && data.clientId !== ''

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/services', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service: 'oidc',
          issuer: data.issuer,
          clientId: data.clientId,
          buttonLabel: data.buttonLabel,
          scopes: data.scopes,
          ...(clientSecret ? { clientSecret } : {}),
          ...(clearClientSecret ? { clearClientSecret: true } : {}),
        }),
      })
      if (!res.ok) throw new Error()
      setHasClientSecret(clearClientSecret ? false : clientSecret ? true : hasClientSecret)
      setClientSecret('')
      setClearClientSecret(false)
      markSaved({ data, clientSecret: '', clearClientSecret: false })
      onToast({ message: of.toastSaved, type: 'success' })
    } catch {
      onToast({ message: of.toastError, type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  async function runTest() {
    setTesting(true)
    setResult(null)
    try {
      const res = await fetch('/api/admin/services/oidc/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issuer: data.issuer }),
      })
      const json = await res.json() as TestResult
      setResult(res.ok ? json : { ok: false, message: of.networkError })
    } catch {
      setResult({ ok: false, message: of.networkError })
    } finally {
      setTesting(false)
    }
  }

  const inputCls = 'w-full bg-surface-container border border-outline-variant/20 rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary/50'
  const spinner = <span className="material-symbols-outlined animate-spin text-base leading-none" aria-hidden="true">progress_activity</span>

  return (
    <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-6 space-y-4">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-xl text-on-surface-variant leading-none" aria-hidden="true">badge</span>
        <h3 className="font-headline font-semibold text-base text-on-surface">{of.title}</h3>
      </div>
      <p className="text-xs text-on-surface-variant">{of.description}</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
        <div className="flex flex-col gap-3">
          <div>
            <label className="block text-sm text-on-surface mb-1.5">{of.issuerLabel}</label>
            <input type="url" value={data.issuer} onChange={e => field('issuer', e.target.value)} className={inputCls} placeholder="https://idp.example.com/realms/leksis" />
          </div>
          <div>
            <label className="block text-sm text-on-surface mb-1.5">{of.clientIdLabel}</label>
            <input type="text" value={data.clientId} onChange={e => field('clientId', e.target.value)} className={inputCls} autoComplete="off" />
          </div>
          <div>
            <label className="block text-sm text-on-surface mb-1.5">{of.clientSecretLabel}</label>
            <input
              type="password" autoComplete="off" value={clientSecret}
              onChange={e => { setClientSecret(e.target.value); setClearClientSecret(false) }}
              className={inputCls}
              placeholder={hasClientSecret && !clearClientSecret ? '••••••••' : ''}
            />
            {hasClientSecret && !clearClientSecret && (
              <p className="mt-1 text-xs text-on-surface-variant flex items-center gap-2">
                <span>{of.clientSecretSaved}</span>
                <button type="button" onClick={() => { setClearClientSecret(true); setClientSecret('') }} className="text-button text-xs">{of.clientSecretRemove}</button>
              </p>
            )}
            {clearClientSecret && <p className="mt-1 text-xs text-on-surface-variant">{of.clientSecretWillRemove}</p>}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div>
            <label className="block text-sm text-on-surface mb-1.5">{of.buttonLabelLabel} <span className="text-on-surface-variant">{of.optional}</span></label>
            <input type="text" value={data.buttonLabel} onChange={e => field('buttonLabel', e.target.value)} className={inputCls} placeholder={of.buttonLabelPlaceholder} />
          </div>
          <div>
            <label className="block text-sm text-on-surface mb-1.5">{of.scopesLabel} <span className="text-on-surface-variant">{of.optional}</span></label>
            <input type="text" value={data.scopes} onChange={e => field('scopes', e.target.value)} className={inputCls} placeholder="openid email profile" />
          </div>
          <div>
            <label className="block text-sm text-on-surface mb-1.5">{of.redirectUriLabel}</label>
            <input type="text" readOnly value={redirectUri} onFocus={e => e.target.select()} className={`${inputCls} text-on-surface-variant`} />
            <p className="mt-1 text-xs text-on-surface-variant">{of.redirectUriHint}</p>
          </div>
        </div>
      </div>

      {result && (
        <div className={`flex items-start gap-2.5 p-3 rounded-lg text-sm ${result.ok ? 'bg-primary/5 border border-primary/20 text-on-surface' : 'bg-error/5 border border-error/20 text-error'}`}>
          <span className="material-symbols-outlined text-base leading-none mt-0.5 shrink-0" aria-hidden="true">{result.ok ? 'check_circle' : 'error'}</span>
          <p className="break-words">{result.ok ? of.testOk : of.testFailed.replace('{0}', result.message ?? '')}</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-outline-variant/10">
        <button onClick={runTest} disabled={testing || saving || !data.issuer} className="text-button disabled:opacity-40">
          {testing ? spinner : <span className="material-symbols-outlined text-base leading-none" aria-hidden="true">network_check</span>}
          {of.testConnection}
        </button>

        <div className="flex-1" />
        <button onClick={handleSave} disabled={saving || testing || !canSave || !dirty} className="action-btn disabled:opacity-40">
          {saving ? spinner : <span className="material-symbols-outlined text-base leading-none" aria-hidden="true">save</span>}
          {of.save}
        </button>
      </div>
    </div>
  )
}

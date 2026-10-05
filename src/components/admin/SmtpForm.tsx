'use client'

import { useEffect, useState } from 'react'
import type { ToastState } from './AdminToast'
import { useI18n } from '@/lib/i18n'
import type { SmtpPublicConfig } from '@/lib/smtp'
import { useDirtyTracking } from '@/hooks/useDirtyTracking'

interface Data {
  host:        string
  port:        string
  secure:      boolean
  user:        string
  fromAddress: string
  fromName:    string
}

interface TestResult {
  ok:      boolean
  sent?:   boolean
  message?: string
}

interface Props {
  initial: SmtpPublicConfig
  onToast: (t: ToastState) => void
  onDirtyChange?: (dirty: boolean) => void
}

const isValidPort = (v: string): boolean => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 65535

export function SmtpForm({ initial, onToast, onDirtyChange }: Props) {
  const { t } = useI18n()
  const sf = t.smtpForm

  const [data, setData] = useState<Data>({
    host:        initial.host,
    port:        String(initial.port || 587),
    secure:      initial.secure,
    user:        initial.user,
    fromAddress: initial.fromAddress,
    fromName:    initial.fromName,
  })
  const [password,     setPassword]     = useState('')
  const [hasPassword,  setHasPassword]  = useState(initial.hasPassword)
  const [clearPassword, setClearPassword] = useState(false)
  const [testTo,       setTestTo]       = useState('')
  const [saving,   setSaving]   = useState(false)
  const [testing,  setTesting]  = useState(false)
  const [sending,  setSending]  = useState(false)
  const [result,   setResult]   = useState<TestResult | null>(null)
  const { dirty, markSaved } = useDirtyTracking({ data, password, clearPassword })
  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])

  const portValid = isValidPort(data.port)
  const canSave = data.host !== '' && data.fromAddress !== '' && portValid

  function field<K extends keyof Data>(k: K, v: Data[K]) {
    setData(prev => ({ ...prev, [k]: v }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/services', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service: 'smtp',
          host: data.host,
          port: Number(data.port),
          secure: data.secure,
          user: data.user,
          fromAddress: data.fromAddress,
          fromName: data.fromName,
          ...(password ? { password } : {}),
          ...(clearPassword ? { clearPassword: true } : {}),
        }),
      })
      if (!res.ok) throw new Error()
      setHasPassword(clearPassword ? false : password ? true : hasPassword)
      setPassword('')
      setClearPassword(false)
      markSaved({ data, password: '', clearPassword: false })
      onToast({ message: sf.toastSaved, type: 'success' })
    } catch {
      onToast({ message: sf.toastError, type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  async function runTest(to?: string) {
    const setBusy = to ? setSending : setTesting
    setBusy(true)
    setResult(null)
    try {
      const res = await fetch('/api/admin/services/smtp/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: data.host,
          port: Number(data.port),
          secure: data.secure,
          user: data.user,
          fromAddress: data.fromAddress,
          fromName: data.fromName,
          ...(password ? { password } : {}),
          ...(to ? { to } : {}),
        }),
      })
      const json = await res.json() as TestResult
      setResult(res.ok ? json : { ok: false, message: sf.networkError })
    } catch {
      setResult({ ok: false, message: sf.networkError })
    } finally {
      setBusy(false)
    }
  }

  const inputCls = 'w-full bg-surface-container border border-outline-variant/20 rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary/50'
  const spinner = <span className="material-symbols-outlined animate-spin text-base leading-none" aria-hidden="true">progress_activity</span>

  return (
    <form onSubmit={e => e.preventDefault()} className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-6 space-y-4">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-xl text-on-surface-variant leading-none" aria-hidden="true">forward_to_inbox</span>
        <h3 className="font-headline font-semibold text-base text-on-surface">{sf.title}</h3>
      </div>
      <p className="text-xs text-on-surface-variant">{sf.description}</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
        <div className="flex flex-col gap-3">
          <div>
            <label className="block text-sm text-on-surface mb-1.5">{sf.hostLabel}</label>
            <input type="text" value={data.host} onChange={e => field('host', e.target.value)} className={inputCls} placeholder="smtp.example.com" />
          </div>
          <div>
            <label className="block text-sm text-on-surface mb-1.5">{sf.portLabel}</label>
            <input
              type="number" min={1} max={65535} value={data.port}
              onChange={e => field('port', e.target.value)}
              className={`${inputCls} sm:w-1/3 ${portValid ? '' : 'border-error/60'}`}
            />
          </div>
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input type="checkbox" checked={data.secure} onChange={e => field('secure', e.target.checked)} className="h-4 w-4 rounded border-outline-variant/40 text-primary accent-primary" />
            <span className="text-sm text-on-surface">{sf.secureLabel}</span>
          </label>
        </div>

        <div className="flex flex-col gap-3">
          <div>
            <label className="block text-sm text-on-surface mb-1.5">{sf.userLabel} <span className="text-on-surface-variant">{sf.optional}</span></label>
            <input type="text" value={data.user} onChange={e => field('user', e.target.value)} className={inputCls} autoComplete="off" />
          </div>
          <div>
            <label className="block text-sm text-on-surface mb-1.5">{sf.passwordLabel} <span className="text-on-surface-variant">{sf.optional}</span></label>
            <input
              type="password" autoComplete="off" value={password}
              onChange={e => { setPassword(e.target.value); setClearPassword(false) }}
              className={inputCls}
              placeholder={hasPassword && !clearPassword ? '••••••••' : ''}
            />
            {hasPassword && !clearPassword && (
              <p className="mt-1 text-xs text-on-surface-variant flex items-center gap-2">
                <span>{sf.passwordSaved}</span>
                <button type="button" onClick={() => { setClearPassword(true); setPassword('') }} className="text-button text-xs">{sf.passwordRemove}</button>
              </p>
            )}
            {clearPassword && <p className="mt-1 text-xs text-on-surface-variant">{sf.passwordWillRemove}</p>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
        <div>
          <label className="block text-sm text-on-surface mb-1.5">{sf.fromAddressLabel}</label>
          <input type="email" value={data.fromAddress} onChange={e => field('fromAddress', e.target.value)} className={inputCls} placeholder="no-reply@example.com" />
        </div>
        <div>
          <label className="block text-sm text-on-surface mb-1.5">{sf.fromNameLabel} <span className="text-on-surface-variant">{sf.optional}</span></label>
          <input type="text" value={data.fromName} onChange={e => field('fromName', e.target.value)} className={inputCls} />
        </div>
      </div>

      {result && (
        <div className={`flex items-start gap-2.5 p-3 rounded-lg text-sm ${result.ok ? 'bg-primary/5 border border-primary/20 text-on-surface' : 'bg-error/5 border border-error/20 text-error'}`}>
          <span className="material-symbols-outlined text-base leading-none mt-0.5 shrink-0" aria-hidden="true">{result.ok ? 'check_circle' : 'error'}</span>
          <p className="break-words">
            {result.ok
              ? (result.sent ? sf.testEmailSent : sf.testOk)
              : sf.testFailed.replace('{0}', result.message ?? '')}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3 pt-3 border-t border-outline-variant/10">
        <button type="button" onClick={() => runTest()} disabled={testing || sending || saving || !data.host} className="text-button disabled:opacity-40">
          {testing ? spinner : <span className="material-symbols-outlined text-base leading-none" aria-hidden="true">network_check</span>}
          {sf.testConnection}
        </button>

        <div className="flex items-end gap-2">
          <div>
            <label className="block text-xs text-on-surface-variant mb-1">{sf.testEmailRecipientLabel}</label>
            <input
              type="email" value={testTo} onChange={e => setTestTo(e.target.value)}
              placeholder={sf.testEmailRecipientPlaceholder}
              className={`${inputCls} !py-1.5 w-56`}
            />
          </div>
          <button type="button" onClick={() => runTest(testTo)} disabled={testing || sending || saving || !data.host || !testTo} className="text-button disabled:opacity-40">
            {sending ? spinner : <span className="material-symbols-outlined text-base leading-none" aria-hidden="true">send</span>}
            {sf.sendTestEmail}
          </button>
        </div>

        <div className="flex-1" />
        <button type="button" onClick={handleSave} disabled={saving || testing || sending || !canSave || !dirty} className="action-btn disabled:opacity-40">
          {saving ? spinner : <span className="material-symbols-outlined text-base leading-none" aria-hidden="true">save</span>}
          {sf.save}
        </button>
      </div>
    </form>
  )
}

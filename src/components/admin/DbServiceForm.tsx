'use client'

import { useState } from 'react'
import type { ToastState } from './AdminToast'
import { useI18n } from '@/lib/i18n'

interface DbData { host: string; port: number; database: string; user: string }
interface TestResult { ok: boolean; latencyMs?: number; message: string }

interface Props {
  initial: DbData
  onToast: (t: ToastState) => void
}

export function DbServiceForm({ initial, onToast }: Props) {
  const { t } = useI18n()
  const [data, setData]       = useState<DbData>({
    host:     initial.host     ?? 'localhost',
    port:     initial.port     ?? 5432,
    database: initial.database ?? 'leksis',
    user:     initial.user     ?? 'leksis_user',
  })
  const [password, setPassword]   = useState('')
  const [showPwd, setShowPwd]     = useState(false)
  const [saving, setSaving]       = useState(false)
  const [testing, setTesting]     = useState(false)
  const [result, setResult]       = useState<TestResult | null>(null)

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/services', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service: 'db', ...data, ...(password ? { password } : {}) }),
      })
      if (!res.ok) throw new Error()
      onToast({ message: t.dbForm.toastSaved, type: 'success' })
      setPassword('')
    } catch {
      onToast({ message: t.dbForm.toastError, type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  async function handleTest() {
    setTesting(true)
    setResult(null)
    try {
      const res = await fetch('/api/admin/services/db/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, ...(password ? { password } : {}) }),
      })
      const json = await res.json()
      setResult(json)
    } catch {
      setResult({ ok: false, message: t.dbForm.networkError })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-6 space-y-5">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-xl text-on-surface-variant leading-none" aria-hidden="true">database</span>
        <h3 className="font-headline font-semibold text-base text-on-surface">PostgreSQL</h3>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm text-on-surface mb-1.5">{t.dbForm.hostLabel}</label>
          <input
            type="text"
            value={data.host}
            onChange={e => setData(prev => ({ ...prev, host: e.target.value }))}
            className="w-full bg-surface-container border border-outline-variant/20 rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary/50"
            placeholder="192.168.40.225"
          />
        </div>
        <div>
          <label className="block text-sm text-on-surface mb-1.5">{t.dbForm.portLabel}</label>
          <input
            type="number"
            value={data.port}
            onChange={e => setData(prev => ({ ...prev, port: parseInt(e.target.value) || 5432 }))}
            className="w-full bg-surface-container border border-outline-variant/20 rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary/50"
          />
        </div>
        <div>
          <label className="block text-sm text-on-surface mb-1.5">{t.dbForm.databaseLabel}</label>
          <input
            type="text"
            value={data.database}
            onChange={e => setData(prev => ({ ...prev, database: e.target.value }))}
            className="w-full bg-surface-container border border-outline-variant/20 rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary/50"
          />
        </div>
        <div>
          <label className="block text-sm text-on-surface mb-1.5">{t.dbForm.userLabel}</label>
          <input
            type="text"
            value={data.user}
            onChange={e => setData(prev => ({ ...prev, user: e.target.value }))}
            className="w-full bg-surface-container border border-outline-variant/20 rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary/50"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm text-on-surface mb-1.5">
            {t.dbForm.passwordLabel}
            <span className="text-xs text-on-surface-variant ml-1.5">{t.dbForm.passwordHint}</span>
          </label>
          <div className="relative">
            <input
              type={showPwd ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-surface-container border border-outline-variant/20 rounded-lg px-3 py-2 pr-10 text-sm text-on-surface focus:outline-none focus:border-primary/50"
              placeholder="••••••••"
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowPwd(v => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 icon-btn"
              aria-label={showPwd ? t.dbForm.hidePassword : t.dbForm.showPassword}
            >
              <span className="material-symbols-outlined text-base leading-none" aria-hidden="true">
                {showPwd ? 'visibility_off' : 'visibility'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Résultat du test */}
      {result && (
        <div className={`flex items-start gap-2.5 p-3 rounded-lg text-sm ${
          result.ok ? 'bg-primary/5 border border-primary/20 text-on-surface' : 'bg-error/5 border border-error/20 text-error'
        }`}>
          <span className="material-symbols-outlined text-base leading-none mt-0.5 shrink-0" aria-hidden="true">
            {result.ok ? 'check_circle' : 'error'}
          </span>
          <div>
            <p>{result.message}</p>
            {result.ok && result.latencyMs !== undefined && (
              <p className="text-xs text-on-surface-variant mt-0.5">{result.latencyMs}ms</p>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={handleTest}
          disabled={testing || !data.host}
          className="text-button disabled:opacity-40"
        >
          {testing ? (
            <span className="material-symbols-outlined animate-spin text-base leading-none" aria-hidden="true">progress_activity</span>
          ) : (
            <span className="material-symbols-outlined text-base leading-none" aria-hidden="true">network_check</span>
          )}
          {t.dbForm.testConnection}
        </button>
        <div className="flex-1" />
        <button onClick={handleSave} disabled={saving} className="action-btn disabled:opacity-40">
          {saving ? (
            <span className="material-symbols-outlined animate-spin text-base leading-none" aria-hidden="true">progress_activity</span>
          ) : (
            <span className="material-symbols-outlined text-base leading-none" aria-hidden="true">save</span>
          )}
          {t.dbForm.save}
        </button>
      </div>
    </div>
  )
}

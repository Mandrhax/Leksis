'use client'

import { useState } from 'react'
import type { ToastState } from './AdminToast'
import { useI18n } from '@/lib/i18n'
import type { SmtpPublicConfig } from '@/lib/smtp'
import type { OidcPublicConfig } from '@/lib/auth-methods'
import type { AuthMethod } from '@/lib/settings-schema'

interface Props {
  initial: { method: AuthMethod }
  smtp: SmtpPublicConfig
  oidc: OidcPublicConfig
  onToast: (t: ToastState) => void
}

const isSmtpConfigured = (s: SmtpPublicConfig) => s.host !== '' && s.fromAddress !== ''
const isOidcConfigured = (o: OidcPublicConfig) => o.issuer !== '' && o.clientId !== '' && o.hasClientSecret

export function ConnexionForm({ initial, smtp, oidc, onToast }: Props) {
  const { t } = useI18n()
  const cf = t.connexionForm

  const [method, setMethod] = useState<AuthMethod>(initial.method)
  const [saving, setSaving] = useState(false)

  const smtpOk = isSmtpConfigured(smtp)
  const oidcOk = isOidcConfigured(oidc)

  const cards: { id: AuthMethod; title: string; desc: string; hint?: string; disabled?: boolean }[] = [
    { id: 'otp_display', title: cf.methodOtpDisplay, desc: cf.methodOtpDisplayDesc },
    { id: 'otp_email', title: cf.methodOtpEmail, desc: cf.methodOtpEmailDesc, hint: !smtpOk ? cf.requiresSmtpHint : undefined, disabled: !smtpOk },
    { id: 'password_admin_approval', title: cf.methodPasswordAdminApproval, desc: cf.methodPasswordAdminApprovalDesc },
    { id: 'password_email_verify', title: cf.methodPasswordEmailVerify, desc: cf.methodPasswordEmailVerifyDesc, hint: !smtpOk ? cf.requiresSmtpHint : undefined, disabled: !smtpOk },
    { id: 'sso_oidc', title: cf.methodSsoOidc, desc: cf.methodSsoOidcDesc, hint: !oidcOk ? cf.requiresOidcHint : undefined, disabled: !oidcOk },
  ]

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/services', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service: 'auth', method }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        onToast({
          message: json.error === 'smtp_not_configured' ? cf.errSmtpNotConfigured
            : json.error === 'oidc_not_configured' ? cf.errOidcNotConfigured
            : cf.toastError,
          type: 'error',
        })
        return
      }
      onToast({ message: cf.toastSaved, type: 'success' })
    } catch {
      onToast({ message: cf.toastError, type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-6 space-y-4">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-xl text-on-surface-variant leading-none" aria-hidden="true">lock</span>
        <h3 className="font-headline font-semibold text-base text-on-surface">{cf.title}</h3>
      </div>
      <p className="text-xs text-on-surface-variant">{cf.description}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="radiogroup" aria-label={cf.title}>
        {cards.map(card => (
          <button
            key={card.id}
            type="button"
            role="radio"
            aria-checked={method === card.id}
            disabled={card.disabled && method !== card.id}
            onClick={() => setMethod(card.id)}
            className={`text-left rounded-lg border px-4 py-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              method === card.id
                ? 'border-primary bg-primary/5'
                : 'border-outline-variant/30 hover:border-outline-variant'
            }`}
          >
            <span className="block text-sm font-semibold text-on-surface">{card.title}</span>
            <span className="block text-xs text-on-surface-variant mt-1">
              {card.disabled && card.hint ? card.hint : card.desc}
            </span>
          </button>
        ))}
      </div>

      {method !== initial.method && (
        <p className="text-xs text-error">{cf.switchWarning}</p>
      )}

      <div className="flex justify-end pt-3 border-t border-outline-variant/10">
        <button onClick={handleSave} disabled={saving} className="action-btn disabled:opacity-40">
          {saving
            ? <span className="material-symbols-outlined animate-spin text-base leading-none" aria-hidden="true">progress_activity</span>
            : <span className="material-symbols-outlined text-base leading-none" aria-hidden="true">save</span>}
          {cf.save}
        </button>
      </div>
    </div>
  )
}


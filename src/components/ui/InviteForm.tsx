'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useI18n } from '@/lib/i18n'
import { UILanguageSwitcher } from '@/components/ui/UILanguageSwitcher'
import { LegalLinks } from '@/components/ui/LegalLinks'

const MIN_PASSWORD_LENGTH = 10

const inputCls = `w-full px-3 py-2.5 text-sm rounded-lg border border-outline-variant/40 bg-background
                  text-on-surface placeholder:text-on-surface-variant/50
                  focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/60
                  transition-colors`
const labelCls = 'block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2'

/** Page ouverte depuis un lien d'invitation : la personne choisit son mot de passe. `email` null = lien invalide ou expiré. */
export function InviteForm({ siteName, token, email }: { siteName: string; token: string; email: string | null }) {
  const { t } = useI18n()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [done, setDone]         = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < MIN_PASSWORD_LENGTH) { setError(t.invite.errWeakPassword); return }
    if (password !== confirm) { setError(t.invite.errPasswordMismatch); return }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(
          data.code === 'invalid_link'   ? t.invite.invalidLink
          : data.code === 'rate_limited' ? t.invite.errRateLimited
          : data.code === 'invalid'      ? t.invite.errWeakPassword
          : t.invite.errGeneric,
        )
        return
      }
      setDone(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="absolute top-4 right-4">
        <UILanguageSwitcher />
      </div>

      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="font-headline text-2xl font-bold text-on-surface tracking-tight">{siteName}</h1>
          <p className="mt-1 text-sm text-on-surface-variant">{t.invite.title}</p>
        </div>

        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-8 shadow-sm">
          {done ? (
            <div className="text-center space-y-3">
              <p className="font-headline text-lg font-bold text-on-surface">{t.invite.doneTitle}</p>
              <p className="text-sm text-on-surface-variant">{t.invite.doneMessage}</p>
              <Link href="/auth/signin" className="action-btn inline-flex justify-center">{t.invite.goToSignIn}</Link>
            </div>
          ) : !email ? (
            <div className="text-center space-y-3">
              <p className="text-sm text-error">{t.invite.invalidLink}</p>
              <Link href="/auth/signin" className="inline-block text-xs text-primary hover:underline">{t.invite.goToSignIn}</Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <p className="text-sm text-on-surface-variant">{t.invite.intro.replace('{0}', email)}</p>

              <div>
                <label htmlFor="password" className={labelCls}>{t.invite.passwordLabel}</label>
                <input id="password" type="password" required autoFocus autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH}
                  value={password} onChange={e => setPassword(e.target.value)} placeholder={t.invite.passwordPlaceholder} className={inputCls} />
              </div>

              <div>
                <label htmlFor="confirm" className={labelCls}>{t.invite.confirmLabel}</label>
                <input id="confirm" type="password" required autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH}
                  value={confirm} onChange={e => setConfirm(e.target.value)} placeholder={t.invite.passwordPlaceholder} className={inputCls} />
              </div>

              {error && <p className="text-xs text-error">{error}</p>}

              <button type="submit" disabled={loading || !password || !confirm} className="action-btn w-full justify-center">
                {loading ? t.invite.submitting : t.invite.submit}
              </button>
            </form>
          )}
        </div>

        <nav className="mt-6 flex items-center justify-center gap-4">
          <LegalLinks className="text-xs text-on-surface-variant hover:text-on-surface transition-colors" />
        </nav>
      </div>
    </div>
  )
}

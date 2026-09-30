'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useI18n } from '@/lib/i18n'
import { UILanguageSwitcher } from '@/components/ui/UILanguageSwitcher'
import { LegalLinks } from '@/components/ui/LegalLinks'

const MIN_PASSWORD_LENGTH = 10

type Status = 'pending_approval' | 'pending_verification'

export function SignUpForm({ siteName }: { siteName: string }) {
  const { t } = useI18n()

  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [status, setStatus]     = useState<Status | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t.signUp.errWeakPassword)
      return
    }
    if (password !== confirm) {
      setError(t.signUp.errPasswordMismatch)
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          name: name.trim() || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(
          data.code === 'email_taken'      ? t.signUp.errEmailTaken
          : data.code === 'rate_limited'   ? t.signUp.errRateLimited
          : data.code === 'method_disabled' ? t.signUp.errMethodDisabled
          : data.code === 'invalid'        ? t.signUp.errWeakPassword
          : t.signUp.errGeneric,
        )
        return
      }

      setStatus(data.status === 'pending_verification' ? 'pending_verification' : 'pending_approval')
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
          <h1 className="font-headline text-2xl font-bold text-on-surface tracking-tight">
            {siteName}
          </h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            {t.signUp.title}
          </p>
        </div>

        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-8 shadow-sm">

          {status ? (
            <div className="text-center space-y-3">
              <p className="font-headline text-lg font-bold text-on-surface">
                {status === 'pending_verification' ? t.signUp.pendingVerificationTitle : t.signUp.pendingApprovalTitle}
              </p>
              <p className="text-sm text-on-surface-variant">
                {status === 'pending_verification'
                  ? t.signUp.pendingVerificationMessage.replace('{0}', email.trim().toLowerCase())
                  : t.signUp.pendingApprovalMessage}
              </p>
              <Link href="/auth/signin" className="inline-block text-xs text-primary hover:underline">
                {t.signUp.backToSignIn}
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="name" className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">
                  {t.signUp.nameLabel}
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm rounded-lg border border-outline-variant/40 bg-background
                             text-on-surface placeholder:text-on-surface-variant/50
                             focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/60
                             transition-colors"
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">
                  {t.signUp.emailLabel}
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder={t.signUp.emailPlaceholder}
                  className="w-full px-3 py-2.5 text-sm rounded-lg border border-outline-variant/40 bg-background
                             text-on-surface placeholder:text-on-surface-variant/50
                             focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/60
                             transition-colors"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">
                  {t.signUp.passwordLabel}
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  autoComplete="new-password"
                  minLength={MIN_PASSWORD_LENGTH}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={t.signUp.passwordPlaceholder}
                  className="w-full px-3 py-2.5 text-sm rounded-lg border border-outline-variant/40 bg-background
                             text-on-surface placeholder:text-on-surface-variant/50
                             focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/60
                             transition-colors"
                />
              </div>

              <div>
                <label htmlFor="confirm" className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">
                  {t.signUp.confirmPasswordLabel}
                </label>
                <input
                  id="confirm"
                  type="password"
                  required
                  autoComplete="new-password"
                  minLength={MIN_PASSWORD_LENGTH}
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder={t.signUp.passwordPlaceholder}
                  className="w-full px-3 py-2.5 text-sm rounded-lg border border-outline-variant/40 bg-background
                             text-on-surface placeholder:text-on-surface-variant/50
                             focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/60
                             transition-colors"
                />
              </div>

              {error && (
                <p className="text-xs text-error">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading || !email || !password || !confirm}
                className="action-btn w-full justify-center"
              >
                {loading ? t.signUp.submitting : t.signUp.submit}
              </button>

              <Link
                href="/auth/signin"
                className="block w-full text-center text-xs text-on-surface-variant hover:text-on-surface transition-colors"
              >
                {t.signUp.backToSignIn}
              </Link>
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

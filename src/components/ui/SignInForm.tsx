'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { signIn } from 'next-auth/react'
import { useI18n } from '@/lib/i18n'
import type { Messages } from '@/locales/en'
import { UILanguageSwitcher } from '@/components/ui/UILanguageSwitcher'
import { LegalLinks } from '@/components/ui/LegalLinks'

type AuthMethod = 'otp_display' | 'otp_email' | 'password_admin_approval' | 'password_email_verify' | 'sso_oidc'
type OtpStep = 'email' | 'otp'

// Le proxy (middleware) construit callbackUrl avec l'adresse INTERNE du serveur Next (http://0.0.0.0:3000/…)
// quand NEXTAUTH_URL n'est pas définie : on ne garde que le chemin, relatif à l'adresse réellement
// utilisée par le navigateur (protège aussi contre une redirection vers un autre site).
function safeCallbackPath(raw: string): string {
  try {
    const url = new URL(raw, window.location.origin)
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return '/'
  }
}

function OtpSignIn({ t }: { t: Messages }) {
  const [step, setStep]       = useState<OtpStep>('email')
  const [email, setEmail]     = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [emailSent, setEmailSent] = useState(false)
  const [input, setInput]     = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const inputRef = useRef<HTMLInputElement>(null)

  async function handleRequestCode(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(
          data.code === 'account_disabled' ? t.signIn.errorDisabled
          : data.code === 'domain_not_allowed' ? t.signIn.errorDomain
          : data.code === 'not_invited'    ? t.signIn.errorNotInvited
          : data.code === 'rate_limited'   ? t.signIn.errorRateLimited
          : data.code === 'email_failed'   ? t.signIn.errorEmailFailed
          : t.signIn.errorGeneric,
        )
        return
      }

      setOtpCode(data.code ?? '')
      setEmailSent(data.emailSent === true)
      setStep('otp')
      setTimeout(() => inputRef.current?.focus(), 50)
    } finally {
      setLoading(false)
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await signIn('credentials', {
        email:    email.trim().toLowerCase(),
        otp:      input.trim(),
        redirect: false,
      })

      if (result?.error || !result?.ok) {
        setError(t.signIn.errorInvalid)
        setInput('')
        return
      }

      // Lu à l'envoi seulement (pas de useSearchParams) : la page n'a ainsi aucune frontière Suspense qui retarderait son
      // hydratation — elle s'hydratait après l'application de la langue du navigateur et provoquait l'erreur React #418.
      const callbackUrl = new URLSearchParams(window.location.search).get('callbackUrl') ?? '/'
      window.location.href = safeCallbackPath(callbackUrl)
    } finally {
      setLoading(false)
    }
  }

  return step === 'email' ? (
    <form onSubmit={handleRequestCode} className="space-y-5">
      <div>
        <label htmlFor="email" className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">
          {t.signIn.emailLabel}
        </label>
        <input
          id="email"
          type="email"
          required
          autoFocus
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder={t.signIn.emailPlaceholder}
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
        disabled={loading || !email}
        className="action-btn w-full justify-center"
      >
        {loading ? t.signIn.sending : t.signIn.sendCode}
      </button>
    </form>

  ) : (
    <form onSubmit={handleVerify} className="space-y-5">

      {/* OTP display, or "check your email" when the code was sent instead */}
      {emailSent ? (
        <div className="rounded-lg bg-primary-container/30 border border-primary/20 p-4 text-center">
          <p className="text-sm text-on-surface">{t.signIn.codeSentToEmail.replace('{0}', email)}</p>
          <p className="text-xs text-on-surface-variant mt-1">{t.signIn.codeValid}</p>
        </div>
      ) : (
        <div className="rounded-lg bg-primary-container/30 border border-primary/20 p-4 text-center">
          <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
            {t.signIn.yourCode}
          </p>
          <p className="font-headline text-3xl font-bold tracking-[0.25em] text-primary select-all">
            {otpCode}
          </p>
          <p className="text-xs text-on-surface-variant mt-1">
            {t.signIn.codeValid}
          </p>
        </div>
      )}

      <div>
        <label htmlFor="otp" className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">
          {t.signIn.enterCode}
        </label>
        <input
          id="otp"
          ref={inputRef}
          type="text"
          inputMode="numeric"
          pattern="\d{6}"
          maxLength={6}
          required
          value={input}
          onChange={e => setInput(e.target.value.replace(/\D/g, ''))}
          placeholder="123456"
          className="w-full px-3 py-2.5 text-sm rounded-lg border border-outline-variant/40 bg-background
                     text-on-surface placeholder:text-on-surface-variant/50 text-center tracking-[0.3em]
                     focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/60
                     transition-colors"
        />
      </div>

      {error && (
        <p className="text-xs text-error">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading || input.length !== 6}
        className="action-btn w-full justify-center"
      >
        {loading ? t.signIn.verifying : t.signIn.verify}
      </button>

      <button
        type="button"
        onClick={() => { setStep('email'); setError(''); setInput(''); setOtpCode(''); setEmailSent(false) }}
        className="w-full text-center text-xs text-on-surface-variant hover:text-on-surface transition-colors"
      >
        {t.signIn.useOther}
      </button>
    </form>
  )
}

function PasswordSignIn({ t, inviteOnly }: { t: Messages; inviteOnly: boolean }) {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await signIn('credentials', {
        email:    email.trim().toLowerCase(),
        password,
        redirect: false,
      })

      if (result?.code || result?.error || !result?.ok) {
        setError(
          result?.code === 'account_disabled'       ? t.signIn.errorDisabled
          : result?.code === 'domain_not_allowed'   ? t.signIn.errorDomain
          : result?.code === 'pending_approval'     ? t.signIn.errPendingApproval
          : result?.code === 'pending_verification' ? t.signIn.errPendingVerification
          : t.signIn.errInvalidCredentials,
        )
        return
      }

      const callbackUrl = new URLSearchParams(window.location.search).get('callbackUrl') ?? '/'
      window.location.href = safeCallbackPath(callbackUrl)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="email" className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">
          {t.signIn.emailLabel}
        </label>
        <input
          id="email"
          type="email"
          required
          autoFocus
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder={t.signIn.emailPlaceholder}
          className="w-full px-3 py-2.5 text-sm rounded-lg border border-outline-variant/40 bg-background
                     text-on-surface placeholder:text-on-surface-variant/50
                     focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/60
                     transition-colors"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">
          {t.signIn.passwordLabel}
        </label>
        <input
          id="password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder={t.signIn.passwordPlaceholder}
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
        disabled={loading || !email || !password}
        className="action-btn w-full justify-center"
      >
        {loading ? t.signIn.verifying : t.signIn.signInWithPassword}
      </button>

      {!inviteOnly && (
        <Link
          href="/auth/signup"
          className="block w-full text-center text-xs text-on-surface-variant hover:text-on-surface transition-colors"
        >
          {t.signIn.signUpLink}
        </Link>
      )}
    </form>
  )
}

function SsoSignIn({ t, ssoButtonLabel }: { t: Messages; ssoButtonLabel: string }) {
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    // Navigation réelle (pas redirect:false) : l'utilisateur part vers l'IdP puis revient sur callbackUrl.
    // safeCallbackPath avant signIn() préserve la règle "jamais de callbackUrl absolu", même pour OAuth.
    const callbackUrl = new URLSearchParams(window.location.search).get('callbackUrl') ?? '/'
    await signIn('oidc', { callbackUrl: safeCallbackPath(callbackUrl) })
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="action-btn w-full justify-center"
    >
      {loading ? t.signIn.verifying : t.signIn.ssoButtonPrefix.replace('{0}', ssoButtonLabel)}
    </button>
  )
}

export function SignInForm({ siteName, method, ssoButtonLabel, inviteOnly = false }: { siteName: string; method: AuthMethod; ssoButtonLabel?: string; inviteOnly?: boolean }) {
  const { t } = useI18n()
  const [verifyBanner, setVerifyBanner] = useState<'ok' | 'invalid' | null>(null)
  const [confirmToken, setConfirmToken] = useState<string | null>(null)

  // Lu après le montage (pas useSearchParams) : même raison que callbackUrl plus bas, évite une frontière
  // Suspense qui retarderait l'hydratation.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const v = params.get('verify')
    if (v === 'ok' || v === 'invalid') setVerifyBanner(v)
    // Le lien de l'email n'active rien tout seul (un scanner de messagerie le suit automatiquement) :
    // il faut cliquer ce bouton, qui envoie le jeton en POST.
    const token = params.get('token')
    if (v === 'confirm' && token) setConfirmToken(token)
  }, [])

  const isPassword = method === 'password_admin_approval' || method === 'password_email_verify'
  const isSso = method === 'sso_oidc'

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">

      {/* Language switcher — top right */}
      <div className="absolute top-4 right-4">
        <UILanguageSwitcher />
      </div>

      <div className="w-full max-w-sm">

        {/* Logo / title */}
        <div className="text-center mb-8">
          <h1 className="font-headline text-2xl font-bold text-on-surface tracking-tight">
            {siteName}
          </h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            {t.signIn.subtitle}
          </p>
        </div>

        {verifyBanner && (
          <div className={`mb-4 rounded-lg border p-3 text-center text-xs ${
            verifyBanner === 'ok'
              ? 'bg-primary-container/30 border-primary/20 text-on-surface'
              : 'bg-error/10 border-error/20 text-error'
          }`}>
            {verifyBanner === 'ok' ? t.signIn.verifyOk : t.signIn.verifyInvalid}
          </div>
        )}

        {confirmToken && (
          <form method="POST" action="/api/auth/verify-email" className="mb-4 rounded-lg border border-primary/20 bg-primary-container/30 p-4 text-center">
            <input type="hidden" name="token" value={confirmToken} />
            <p className="mb-3 text-xs text-on-surface">{t.signIn.verifyConfirmText}</p>
            <button type="submit" className="action-btn">{t.signIn.verifyConfirmButton}</button>
          </form>
        )}

        {/* Card */}
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-8 shadow-sm">
          {isSso
            ? <SsoSignIn t={t} ssoButtonLabel={ssoButtonLabel || 'SSO'} />
            : isPassword ? <PasswordSignIn t={t} inviteOnly={inviteOnly} /> : <OtpSignIn t={t} />}
        </div>

        <nav className="mt-6 flex items-center justify-center gap-4">
          <LegalLinks className="text-xs text-on-surface-variant hover:text-on-surface transition-colors" />
        </nav>
      </div>
    </div>
  )
}

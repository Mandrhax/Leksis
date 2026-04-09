'use client'

import { useState, useRef, Suspense } from 'react'
import { signIn } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'

type Step = 'email' | 'otp'

function SignInForm() {
  const searchParams = useSearchParams()
  const callbackUrl  = searchParams.get('callbackUrl') ?? '/'

  const [step, setStep]       = useState<Step>('email')
  const [email, setEmail]     = useState('')
  const [otpCode, setOtpCode] = useState('')   // code affiché à l'utilisateur
  const [input, setInput]     = useState('')   // code saisi par l'utilisateur
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const inputRef = useRef<HTMLInputElement>(null)

  /* ── Étape 1 : demander le code ── */
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
        setError(data.error ?? 'Erreur lors de la génération du code.')
        return
      }

      setOtpCode(data.code)
      setStep('otp')
      setTimeout(() => inputRef.current?.focus(), 50)
    } finally {
      setLoading(false)
    }
  }

  /* ── Étape 2 : vérifier le code ── */
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
        setError('Code incorrect ou expiré. Recommencez.')
        setInput('')
        return
      }

      // Navigation complète pour que le cookie de session soit envoyé
      window.location.href = callbackUrl
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">

        {/* Logo / titre */}
        <div className="text-center mb-8">
          <h1 className="font-headline text-2xl font-bold text-on-surface tracking-tight">
            Leksis
          </h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Connectez-vous pour accéder à l&apos;espace de travail.
          </p>
        </div>

        {/* Card */}
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-8 shadow-sm">

          {step === 'email' ? (
            <form onSubmit={handleRequestCode} className="space-y-5">
              <div>
                <label htmlFor="email" className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">
                  Adresse e-mail
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="vous@exemple.com"
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
                {loading ? 'Envoi…' : 'Obtenir mon code'}
              </button>
            </form>

          ) : (
            <form onSubmit={handleVerify} className="space-y-5">

              {/* Code affiché */}
              <div className="rounded-lg bg-primary-container/30 border border-primary/20 p-4 text-center">
                <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                  Votre code
                </p>
                <p className="font-headline text-3xl font-bold tracking-[0.25em] text-primary select-all">
                  {otpCode}
                </p>
                <p className="text-xs text-on-surface-variant mt-1">
                  Valable 10 minutes
                </p>
              </div>

              <div>
                <label htmlFor="otp" className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">
                  Saisir le code
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
                {loading ? 'Vérification…' : 'Se connecter'}
              </button>

              <button
                type="button"
                onClick={() => { setStep('email'); setError(''); setInput(''); setOtpCode('') }}
                className="w-full text-center text-xs text-on-surface-variant hover:text-on-surface transition-colors"
              >
                Utiliser une autre adresse
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  )
}

'use client'

import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import { I18nProvider, useI18n } from '@/lib/i18n'

type GlossaryPref = {
  glossaryId: number
  name: string
  description: string | null
  enabled: boolean
}

function GlossaryPreferences() {
  const { t } = useI18n()
  const [prefs, setPrefs] = useState<GlossaryPref[]>([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/user/glossary-prefs')
      if (res.ok) setPrefs(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const toggle = async (glossaryId: number, currentEnabled: boolean) => {
    setToggling(glossaryId)
    try {
      const res = await fetch('/api/user/glossary-prefs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ glossaryId, enabled: !currentEnabled }),
      })
      if (res.ok) {
        setPrefs((prev) =>
          prev.map((p) => p.glossaryId === glossaryId ? { ...p, enabled: !currentEnabled } : p),
        )
      }
    } finally {
      setToggling(null)
    }
  }

  return (
    <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-6">
      <h2 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
        {t.settingsPage.glossaries}
      </h2>
      <p className="text-sm text-on-surface-variant mb-4">{t.settingsPage.glossaryDesc}</p>

      {loading ? (
        <div className="flex items-center justify-center py-4">
          <span className="material-symbols-outlined text-lg leading-none animate-spin text-on-surface-variant">
            progress_activity
          </span>
        </div>
      ) : prefs.length === 0 ? (
        <p className="text-sm text-on-surface-variant">{t.settingsPage.glossaryNoItems}</p>
      ) : (
        <div className="space-y-2">
          {prefs.map((pref) => (
            <div
              key={pref.glossaryId}
              className="flex items-center justify-between gap-4 py-2 border-b border-outline-variant/10 last:border-0"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-on-surface truncate">{pref.name}</p>
                {pref.description && (
                  <p className="text-xs text-on-surface-variant truncate">{pref.description}</p>
                )}
              </div>
              <button
                onClick={() => toggle(pref.glossaryId, pref.enabled)}
                disabled={toggling === pref.glossaryId}
                aria-label={pref.enabled ? 'Disable glossary' : 'Enable glossary'}
                className="relative w-10 h-5.5 rounded-full transition-colors flex-shrink-0 focus:outline-none"
                style={{
                  backgroundColor: pref.enabled ? 'var(--color-primary)' : 'var(--color-outline-variant)',
                  opacity: toggling === pref.glossaryId ? 0.6 : 1,
                }}
              >
                <span
                  className="absolute top-0.5 left-0.5 w-4.5 h-4.5 rounded-full bg-white shadow transition-transform"
                  style={{ transform: pref.enabled ? 'translateX(1.375rem)' : 'translateX(0)' }}
                />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SettingsContent() {
  const { t } = useI18n()
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/auth/signin')
  }, [status, router])

  if (status === 'loading' || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <span className="material-symbols-outlined text-on-surface-variant animate-spin text-2xl">
          progress_activity
        </span>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">

      {/* Header */}
      <div className="border-b border-outline-variant/10 px-6 md:px-8 py-3 flex items-center gap-3">
        <button
          onClick={() => router.push('/')}
          className="icon-btn flex items-center justify-center"
          aria-label={t.settingsPage.back}
        >
          <span className="material-symbols-outlined text-lg leading-none text-on-surface-variant">arrow_back</span>
        </button>
        <h1 className="font-headline text-base font-semibold text-on-surface">{t.settingsPage.title}</h1>
      </div>

      {/* Content */}
      <main className="flex-grow flex flex-col items-center px-6 md:px-8 pt-10 pb-16">
        <div className="w-full max-w-md space-y-6">

          {/* Profil */}
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-6">
            <h2 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-4">
              {t.settingsPage.profile}
            </h2>

            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-primary-container flex items-center justify-center flex-shrink-0">
                <span className="font-headline font-bold text-on-primary-container text-lg">
                  {(session.user?.name ?? session.user?.email ?? '?')[0].toUpperCase()}
                </span>
              </div>
              <div className="min-w-0">
                {session.user?.name && (
                  <p className="text-sm font-semibold text-on-surface truncate">{session.user.name}</p>
                )}
                <p className="text-sm text-on-surface-variant truncate">{session.user?.email}</p>
              </div>
            </div>
          </div>

          {/* Glossaries */}
          <GlossaryPreferences />

          {/* Session */}
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-6">
            <h2 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-4">
              {t.settingsPage.session}
            </h2>
            <p className="text-sm text-on-surface-variant mb-4">
              {t.settingsPage.sessionDesc}
            </p>
            <button
              onClick={() => signOut({ callbackUrl: '/auth/signin' })}
              className="flex items-center gap-2 text-sm font-medium text-error hover:text-error/80 transition-colors"
            >
              <span className="material-symbols-outlined text-base leading-none" aria-hidden="true">logout</span>
              {t.settingsPage.signOut}
            </button>
          </div>

        </div>
      </main>
    </div>
  )
}

export default function SettingsPage() {
  return (
    <I18nProvider>
      <SettingsContent />
    </I18nProvider>
  )
}

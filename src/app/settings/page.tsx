'use client'

import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { I18nProvider, useI18n } from '@/lib/i18n'

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

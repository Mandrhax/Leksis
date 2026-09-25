'use client'

import { I18nProvider, useI18n } from '@/lib/i18n'

function MaintenanceContent({ message }: { message?: string }) {
  const { t } = useI18n()
  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-on-background px-6">
      <div className="text-center max-w-md space-y-4">
        <span className="material-symbols-outlined text-5xl text-on-surface-variant" aria-hidden="true">
          engineering
        </span>
        <h1 className="font-headline font-bold text-2xl text-on-surface">{t.maintenance.title}</h1>
        <p className="text-sm text-on-surface-variant leading-relaxed">
          {message?.trim() || t.maintenance.defaultMessage}
        </p>
      </div>
    </div>
  )
}

/** Écran affiché aux non-admins quand le mode maintenance est actif (traduit selon la langue de l'interface). */
export function MaintenanceScreen({ message }: { message?: string }) {
  return (
    <I18nProvider>
      <MaintenanceContent message={message} />
    </I18nProvider>
  )
}

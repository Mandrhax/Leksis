'use client'

import { I18nProvider } from '@/lib/i18n'
import { UILanguageSwitcher } from '@/components/ui/UILanguageSwitcher'

export function AdminClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <div className="absolute right-4 top-4 z-50">
        <UILanguageSwitcher />
      </div>
      {children}
    </I18nProvider>
  )
}

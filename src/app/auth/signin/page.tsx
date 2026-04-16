import { Suspense } from 'react'
import { I18nProvider } from '@/lib/i18n'
import { SignInForm } from '@/components/ui/SignInForm'

async function loadSiteName(): Promise<string> {
  try {
    const { getAllSettings } = await import('@/lib/settings')
    const s = await getAllSettings()
    return (s.branding?.siteName as string) ?? 'Leksis'
  } catch {
    return 'Leksis'
  }
}

export default async function SignInPage() {
  const siteName = await loadSiteName()
  return (
    <I18nProvider>
      <Suspense>
        <SignInForm siteName={siteName} />
      </Suspense>
    </I18nProvider>
  )
}

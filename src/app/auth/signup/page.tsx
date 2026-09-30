// Voir signin/page.tsx : sans force-dynamic, Next mettrait cette page en cache (getAuthMethod() lit la DB
// via `pg`, pas via fetch(), donc n'est pas reconnu comme une « Dynamic API »).
export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { I18nProvider } from '@/lib/i18n'
import { SignUpForm } from '@/components/ui/SignUpForm'
import { getAuthMethod } from '@/lib/auth-methods'

async function loadSiteName(): Promise<string> {
  try {
    const { getAllSettings } = await import('@/lib/settings')
    const s = await getAllSettings() as Record<string, Record<string, unknown>>
    return (s.branding?.siteName as string) ?? 'Leksis'
  } catch {
    return 'Leksis'
  }
}

export default async function SignUpPage() {
  // Page inutile (et trompeuse) tant qu'une méthode mot de passe n'est pas active — mieux vaut rediriger
  // que d'afficher un formulaire d'inscription qui échouerait à la soumission.
  const method = await getAuthMethod()
  if (method !== 'password_admin_approval' && method !== 'password_email_verify') {
    redirect('/auth/signin')
  }

  const siteName = await loadSiteName()
  return (
    <I18nProvider>
      <SignUpForm siteName={siteName} />
    </I18nProvider>
  )
}

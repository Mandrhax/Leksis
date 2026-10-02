// getAuthMethod()/getAllSettings() lisent la DB via `pg`, pas via fetch() : Next ne les reconnaît pas comme
// une « Dynamic API » et mettrait sinon cette page en cache indéfiniment (Full Route Cache) — un changement
// de méthode de connexion ne se verrait jamais sans redémarrer. Même raison que admin/settings, admin/users.
export const dynamic = 'force-dynamic'

import { I18nProvider } from '@/lib/i18n'
import { SignInForm } from '@/components/ui/SignInForm'
import { getAuthPublicConfig } from '@/lib/auth-methods'

async function loadSiteName(): Promise<string> {
  try {
    const { getAllSettings } = await import('@/lib/settings')
    const s = await getAllSettings() as Record<string, Record<string, unknown>>
    return (s.branding?.siteName as string) ?? 'Leksis'
  } catch {
    return 'Leksis'
  }
}

export default async function SignInPage() {
  const [siteName, auth] = await Promise.all([loadSiteName(), getAuthPublicConfig()])
  return (
    <I18nProvider>
      <SignInForm siteName={siteName} method={auth.method} ssoButtonLabel={auth.oidc.buttonLabel} inviteOnly={auth.inviteOnly} />
    </I18nProvider>
  )
}

// Voir signin/page.tsx : sans force-dynamic, Next mettrait cette page en cache (lecture de la DB via `pg`).
export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { I18nProvider } from '@/lib/i18n'
import { InviteForm } from '@/components/ui/InviteForm'
import { getAuthMethod } from '@/lib/auth-methods'
import { peekEmailToken } from '@/lib/accounts'

async function loadSiteName(): Promise<string> {
  try {
    const { getAllSettings } = await import('@/lib/settings')
    const s = await getAllSettings() as Record<string, Record<string, unknown>>
    return (s.branding?.siteName as string) ?? 'Leksis'
  } catch {
    return 'Leksis'
  }
}

export default async function InvitePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const method = await getAuthMethod()
  if (method !== 'password_admin_approval' && method !== 'password_email_verify') redirect('/auth/signin')

  const { token = '' } = await searchParams
  // Vérifié sans être consommé : seul le choix du mot de passe consomme le lien
  const email = token ? await peekEmailToken(token, 'invite') : null
  const siteName = await loadSiteName()

  return (
    <I18nProvider>
      <InviteForm siteName={siteName} token={token} email={email} />
    </I18nProvider>
  )
}

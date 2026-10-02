export const dynamic = 'force-dynamic'

import { requireAdmin }       from '@/lib/admin-guard'
import { getAllSettings }      from '@/lib/settings'
import { getSmtpPublicConfig } from '@/lib/smtp'
import { getAllowedDomains, getAuthMethod, getInviteOnly, getOidcPublicConfig } from '@/lib/auth-methods'
import { SettingsTabs }        from '@/components/admin/SettingsTabs'
import { AdminPageHeader }      from '@/components/admin/AdminPageHeader'

export default async function AdminSettingsPage() {
  await requireAdmin()
  const [allSettings, smtp, oidc, authMethod, allowedDomains, inviteOnly] = await Promise.all([
    getAllSettings(), getSmtpPublicConfig(), getOidcPublicConfig(), getAuthMethod(), getAllowedDomains(), getInviteOnly(),
  ])
  // ai_config / caddy_config / smtp_config / oidc_config portent des secrets chiffrés et ne sont lus que
  // par leurs propres routes (getAiPublicConfig, getSmtpPublicConfig, getOidcPublicConfig…) : ils ne
  // doivent jamais atteindre ce composant client via `settings`, même sous forme chiffrée.
  const { ai_config: _ai, caddy_config: _caddy, smtp_config: _smtp, oidc_config: _oidc, ...settings } = allSettings

  return (
    <div className="p-4 md:p-8 max-w-[1400px]">
      <AdminPageHeader section="settings" />
      <SettingsTabs settings={settings} smtp={smtp} oidc={oidc} authMethod={authMethod} allowedDomains={allowedDomains} inviteOnly={inviteOnly} />
    </div>
  )
}

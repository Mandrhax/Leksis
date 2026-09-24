export const dynamic = 'force-dynamic'

import { requireAdmin }       from '@/lib/admin-guard'
import { getAllSettings }      from '@/lib/settings'
import { getAiConfig }         from '@/lib/llm'
import { SettingsTabs }        from '@/components/admin/SettingsTabs'
import { AdminPageHeader }      from '@/components/admin/AdminPageHeader'

export default async function AdminSettingsPage() {
  await requireAdmin()
  const [settings, aiCfg] = await Promise.all([getAllSettings(), getAiConfig()])

  return (
    <div className="p-4 md:p-8 max-w-[1400px]">
      <AdminPageHeader section="settings" />
      <SettingsTabs settings={settings} aiProvider={aiCfg.provider} />
    </div>
  )
}

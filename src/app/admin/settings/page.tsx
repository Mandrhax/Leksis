export const dynamic = 'force-dynamic'

import { requireAdmin }       from '@/lib/admin-guard'
import { getAllSettings }      from '@/lib/settings'
import { SettingsAccordion }   from '@/components/admin/SettingsAccordion'
import { AdminPageHeader }      from '@/components/admin/AdminPageHeader'

export default async function AdminSettingsPage() {
  await requireAdmin()
  const settings = await getAllSettings()

  return (
    <div className="p-4 md:p-8 max-w-[1400px]">
      <AdminPageHeader section="settings" />
      <SettingsAccordion settings={settings} />
    </div>
  )
}

export const dynamic = 'force-dynamic'

import { requireAdmin }     from '@/lib/admin-guard'
import { getSetting }       from '@/lib/settings'
import { ExportImportForm } from '@/components/admin/ExportImportForm'
import { AdminPageHeader }  from '@/components/admin/AdminPageHeader'

interface SystemStatus {
  lastBackupAt?: string
}

export default async function AdminBackupPage() {
  await requireAdmin()
  const systemStatus = await getSetting<SystemStatus>('system_status')

  return (
    <div className="p-4 md:p-8 max-w-[1400px]">
      <AdminPageHeader section="backup" />
      <ExportImportForm lastBackupAt={systemStatus.lastBackupAt ?? null} />
    </div>
  )
}

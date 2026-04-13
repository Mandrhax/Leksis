export const dynamic = 'force-dynamic'

import { requireAdmin }     from '@/lib/admin-guard'
import { ExportImportForm } from '@/components/admin/ExportImportForm'
import { AdminPageHeader }  from '@/components/admin/AdminPageHeader'

export default async function AdminBackupPage() {
  await requireAdmin()

  return (
    <div className="p-4 md:p-8 max-w-3xl">
      <AdminPageHeader section="backup" />
      <ExportImportForm />
    </div>
  )
}

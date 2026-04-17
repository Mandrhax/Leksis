export const dynamic = 'force-dynamic'

import { requireAdmin }    from '@/lib/admin-guard'
import { AuditTable }      from '@/components/admin/AuditTable'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'

export default async function AdminAuditPage() {
  await requireAdmin()

  return (
    <div className="p-4 md:p-8 max-w-[1400px]">
      <AdminPageHeader section="audit" />
      <AuditTable />
    </div>
  )
}

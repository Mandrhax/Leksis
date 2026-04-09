export const dynamic = 'force-dynamic'

import { requireAdmin }    from '@/lib/admin-guard'
import { UsagePanel }      from '@/components/admin/UsagePanel'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'

export default async function AdminUsagePage() {
  await requireAdmin()

  return (
    <div className="p-8 max-w-5xl">
      <AdminPageHeader section="usage" />
      <UsagePanel />
    </div>
  )
}

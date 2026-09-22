export const dynamic = 'force-dynamic'

import { requireAdmin } from '@/lib/admin-guard'
import { getSetting }   from '@/lib/settings'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { DbServicesLayout } from '@/components/admin/DbServicesLayout'

export default async function AdminServicesDbPage() {
  await requireAdmin()
  const db     = await getSetting<Record<string, unknown>>('db_config')
  const safeDb = { ...db }
  delete safeDb.passwordEnc

  return (
    <div className="p-4 md:p-8 max-w-[1400px]">
      <AdminPageHeader section="servicesDb" />
      <DbServicesLayout initial={safeDb as { host: string; port: number; database: string; user: string }} />
    </div>
  )
}

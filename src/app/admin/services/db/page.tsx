export const dynamic = 'force-dynamic'

import { requireAdmin } from '@/lib/admin-guard'
import { getSetting }   from '@/lib/settings'
import { ServicesPanel } from '@/components/admin/ServicesPanel'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { DbMetrics }       from '@/components/admin/DbMetrics'

export default async function AdminServicesDbPage() {
  await requireAdmin()
  const db     = await getSetting<Record<string, unknown>>('db_config')
  const safeDb = { ...db }
  delete safeDb.passwordEnc

  return (
    <div className="p-4 md:p-8 max-w-[1400px]">
      <AdminPageHeader section="servicesDb" />
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-6 items-start">
        <ServicesPanel mode="db" initial={safeDb as { host: string; port: number; database: string; user: string }} />
        <DbMetrics />
      </div>
    </div>
  )
}

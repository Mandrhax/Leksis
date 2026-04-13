export const dynamic = 'force-dynamic'

import { requireAdmin } from '@/lib/admin-guard'
import { getSetting }   from '@/lib/settings'
import { ServicesPanel } from '@/components/admin/ServicesPanel'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'

export default async function AdminServicesDbPage() {
  await requireAdmin()
  const db     = await getSetting<Record<string, unknown>>('db_config')
  const safeDb = { ...db }
  delete safeDb.passwordEnc

  return (
    <div className="p-8 max-w-3xl">
      <AdminPageHeader section="servicesDb" />
      <ServicesPanel mode="db" initial={safeDb as { host: string; port: number; database: string; user: string }} />
    </div>
  )
}

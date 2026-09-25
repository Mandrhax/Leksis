export const dynamic = 'force-dynamic'

import { requireAdmin } from '@/lib/admin-guard'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { DbMetrics } from '@/components/admin/DbMetrics'

// La connexion à PostgreSQL vient de DATABASE_URL (docker-compose / .env) : rien à configurer ici, seulement à surveiller
export default async function AdminServicesDbPage() {
  await requireAdmin()

  return (
    <div className="p-4 md:p-8 max-w-[1400px]">
      <AdminPageHeader section="servicesDb" />
      <DbMetrics />
    </div>
  )
}

export const dynamic = 'force-dynamic'

import { requireAdmin }    from '@/lib/admin-guard'
import { getSetting }      from '@/lib/settings'
import { ServicesPanel }   from '@/components/admin/ServicesPanel'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'

export default async function AdminServicesPage() {
  await requireAdmin()
  const ollama = await getSetting<Record<string, unknown>>('ollama_config')
  const db     = await getSetting<Record<string, unknown>>('db_config')

  // Ne jamais passer le passwordEnc côté client
  const safeDb = { ...db }
  delete safeDb.passwordEnc

  return (
    <div className="p-8 max-w-3xl">
      <AdminPageHeader section="services" />
      <ServicesPanel
        ollamaInitial={ollama as { baseUrl: string; model: string; ocrModel: string }}
        dbInitial={safeDb as { host: string; port: number; database: string; user: string }}
      />
    </div>
  )
}

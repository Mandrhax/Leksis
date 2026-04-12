export const dynamic = 'force-dynamic'

import { requireAdmin }    from '@/lib/admin-guard'
import { getSetting }      from '@/lib/settings'
import { getOllamaConfig } from '@/lib/ollama'
import { ServicesPanel }   from '@/components/admin/ServicesPanel'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'

export default async function AdminServicesPage() {
  await requireAdmin()
  const ollama = await getOllamaConfig()
  const db     = await getSetting<Record<string, unknown>>('db_config')

  // Lire sameModelForAll depuis la DB (non présent dans getOllamaConfig)
  const rawOllama = await getSetting<Record<string, unknown>>('ollama_config')
  const ollamaInitial = { ...ollama, sameModelForAll: (rawOllama.sameModelForAll as boolean) ?? false }

  // Ne jamais passer le passwordEnc côté client
  const safeDb = { ...db }
  delete safeDb.passwordEnc

  return (
    <div className="p-8 max-w-3xl">
      <AdminPageHeader section="services" />
      <ServicesPanel
        ollamaInitial={ollamaInitial}
        dbInitial={safeDb as { host: string; port: number; database: string; user: string }}
      />
    </div>
  )
}

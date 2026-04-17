export const dynamic = 'force-dynamic'

import { requireAdmin }         from '@/lib/admin-guard'
import { getSetting }           from '@/lib/settings'
import { getOllamaConfig }      from '@/lib/ollama'
import { AdminPageHeader }      from '@/components/admin/AdminPageHeader'
import { OllamaServicesLayout } from '@/components/admin/OllamaServicesLayout'

export default async function AdminServicesAiPage() {
  await requireAdmin()
  const ollama    = await getOllamaConfig()
  const rawOllama = await getSetting<Record<string, unknown>>('ollama_config')
  const initial   = { ...ollama, sameModelForAll: (rawOllama.sameModelForAll as boolean) ?? false }

  return (
    <div className="p-4 md:p-8 max-w-[1400px]">
      <AdminPageHeader section="servicesAi" />
      <OllamaServicesLayout initial={initial} />
    </div>
  )
}

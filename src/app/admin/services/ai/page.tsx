export const dynamic = 'force-dynamic'

import { requireAdmin }    from '@/lib/admin-guard'
import { getSetting }      from '@/lib/settings'
import { getOllamaConfig } from '@/lib/ollama'
import { ServicesPanel }   from '@/components/admin/ServicesPanel'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { OllamaMetrics }   from '@/components/admin/OllamaMetrics'

export default async function AdminServicesAiPage() {
  await requireAdmin()
  const ollama    = await getOllamaConfig()
  const rawOllama = await getSetting<Record<string, unknown>>('ollama_config')
  const initial   = { ...ollama, sameModelForAll: (rawOllama.sameModelForAll as boolean) ?? false }

  return (
    <div className="p-4 md:p-8 max-w-[1400px]">
      <AdminPageHeader section="servicesAi" />
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-8 items-start">
        <ServicesPanel mode="ai" initial={initial} />
        <OllamaMetrics />
      </div>
    </div>
  )
}

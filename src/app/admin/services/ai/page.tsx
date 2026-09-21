export const dynamic = 'force-dynamic'

import { requireAdmin }         from '@/lib/admin-guard'
import { getAiPublicConfig }    from '@/lib/llm'
import { AdminPageHeader }      from '@/components/admin/AdminPageHeader'
import { OllamaServicesLayout } from '@/components/admin/OllamaServicesLayout'

export default async function AdminServicesAiPage() {
  await requireAdmin()
  const initial = await getAiPublicConfig()

  return (
    <div className="p-4 md:p-8 max-w-[1400px]">
      <AdminPageHeader section="servicesAi" />
      <OllamaServicesLayout initial={initial} />
    </div>
  )
}

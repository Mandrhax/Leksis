export const dynamic = 'force-dynamic'

import { requireAdmin }    from '@/lib/admin-guard'
import { GlossaryAdmin }   from '@/components/admin/GlossaryAdmin'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'

export default async function AdminGlossaryPage() {
  await requireAdmin()

  return (
    <div className="p-4 md:p-8 max-w-[1400px]">
      <AdminPageHeader section="glossary" />
      <GlossaryAdmin />
    </div>
  )
}

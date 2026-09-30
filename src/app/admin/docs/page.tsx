export const dynamic = 'force-dynamic'

import { requireAdmin }    from '@/lib/admin-guard'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { DocsView }        from '@/components/admin/docs/DocsView'

export default async function AdminDocsPage() {
  await requireAdmin()

  return (
    <div className="p-4 md:p-8 max-w-[1400px]">
      <AdminPageHeader section="docs" />
      <DocsView />
    </div>
  )
}

export const dynamic = 'force-dynamic'

import { requireAdmin }    from '@/lib/admin-guard'
import { FeedbackInbox }   from '@/components/admin/FeedbackInbox'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'

export default async function AdminFeedbackPage() {
  await requireAdmin()

  return (
    <div className="p-4 md:p-8 max-w-[1400px]">
      <AdminPageHeader section="feedback" />
      <FeedbackInbox />
    </div>
  )
}

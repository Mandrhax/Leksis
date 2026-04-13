import { requireAdmin } from '@/lib/admin-guard'
import { AdminClientLayout } from '@/components/admin/AdminClientLayout'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin()
  return <AdminClientLayout>{children}</AdminClientLayout>
}

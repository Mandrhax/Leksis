import { requireAdmin } from '@/lib/admin-guard'
import { AdminSidebar } from '@/components/admin/AdminSidebar'
import { AdminClientLayout } from '@/components/admin/AdminClientLayout'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin()

  return (
    <AdminClientLayout>
      <div className="min-h-screen flex" style={{ background: '#f7f9fb' }}>
        <AdminSidebar />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </AdminClientLayout>
  )
}

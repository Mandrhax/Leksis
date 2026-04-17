export const dynamic = 'force-dynamic'

import { requireAdmin }    from '@/lib/admin-guard'
import { query }           from '@/lib/db'
import { UserList }        from '@/components/admin/UserList'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'

export default async function AdminUsersPage() {
  const session = await requireAdmin()

  const result = await query<{
    id: string; email: string; name: string | null; role: string; created_at: string
  }>(`SELECT id, email, name, role, created_at FROM users ORDER BY created_at DESC`)

  return (
    <div className="p-4 md:p-8 max-w-[1400px]">
      <AdminPageHeader section="users" />
      <UserList users={result.rows} currentUserId={session.user.id} />
    </div>
  )
}

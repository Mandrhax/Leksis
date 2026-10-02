export const dynamic = 'force-dynamic'

import { requireAdmin }    from '@/lib/admin-guard'
import { listUsers, USERS_DEFAULT_PAGE_SIZE } from '@/lib/users'
import { getAuthMethod }  from '@/lib/auth-methods'
import { UserList }        from '@/components/admin/UserList'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'

export default async function AdminUsersPage() {
  const session = await requireAdmin()
  const [initial, method] = await Promise.all([
    listUsers({ page: 1, pageSize: USERS_DEFAULT_PAGE_SIZE }),
    getAuthMethod(),
  ])
  // Les liens d'invitation ne servent qu'avec une méthode par mot de passe
  const passwordMode = method === 'password_admin_approval' || method === 'password_email_verify'

  return (
    <div className="p-4 md:p-8 max-w-[1400px]">
      <AdminPageHeader section="users" />
      <UserList initial={initial} currentUserId={session.user.id} passwordMode={passwordMode} />
    </div>
  )
}

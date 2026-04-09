'use client'

import { useState } from 'react'
import { AdminToast } from './AdminToast'
import type { ToastState } from './AdminToast'
import { useI18n } from '@/lib/i18n'

interface User {
  id: string
  email: string
  name: string | null
  role: string
  created_at: string
}

interface Props {
  users: User[]
  currentUserId: string
}

export function UserList({ users: initialUsers, currentUserId }: Props) {
  const { t } = useI18n()
  const [users, setUsers] = useState<User[]>(initialUsers)
  const [loading, setLoading] = useState<string | null>(null)
  const [toast, setToast]    = useState<ToastState>(null)

  async function toggleRole(user: User) {
    const newRole = user.role === 'admin' ? 'user' : 'admin'
    setLoading(user.id)
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      })
      const json = await res.json()
      if (!res.ok) {
        setToast({ message: json.error ?? t.userList.toastError, type: 'error' })
        return
      }
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, role: newRole } : u))
      setToast({ message: t.userList.toastRoleUpdated.replace('{0}', user.email), type: 'success' })
    } catch {
      setToast({ message: t.userList.networkError, type: 'error' })
    } finally {
      setLoading(null)
    }
  }

  return (
    <>
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-outline-variant/10">
              <th className="text-left px-5 py-3 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">{t.userList.colUser}</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-on-surface-variant uppercase tracking-wider hidden sm:table-cell">{t.userList.colCreatedAt}</th>
              <th className="text-center px-5 py-3 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">{t.userList.colAdminRole}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/10">
            {users.map(user => (
              <tr key={user.id} className={user.id === currentUserId ? 'bg-primary/5' : ''}>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary-container flex items-center justify-center shrink-0">
                      <span className="font-headline font-bold text-xs text-on-primary-container leading-none">
                        {(user.name ?? user.email)[0].toUpperCase()}
                      </span>
                    </div>
                    <div>
                      {user.name && <p className="font-medium text-on-surface text-xs">{user.name}</p>}
                      <p className="text-on-surface-variant text-xs">{user.email}</p>
                      {user.id === currentUserId && (
                        <span className="text-xs text-primary">{t.userList.you}</span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3.5 text-xs text-on-surface-variant hidden sm:table-cell">
                  {new Date(user.created_at).toLocaleDateString()}
                </td>
                <td className="px-5 py-3.5 text-center">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={user.role === 'admin'}
                    onClick={() => toggleRole(user)}
                    disabled={loading === user.id}
                    className={`w-10 h-5 rounded-full transition-colors disabled:opacity-40 ${
                      user.role === 'admin' ? 'bg-primary' : 'bg-outline-variant/40'
                    }`}
                    title={user.role === 'admin' ? t.userList.demote : t.userList.promote}
                  >
                    <span className={`block w-3.5 h-3.5 rounded-full bg-white shadow transition-transform mx-0.5 ${
                      user.role === 'admin' ? 'translate-x-[1.3rem]' : 'translate-x-0'
                    }`} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <AdminToast toast={toast} onDismiss={() => setToast(null)} />
    </>
  )
}

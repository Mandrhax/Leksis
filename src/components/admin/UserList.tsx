'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AdminToast } from './AdminToast'
import type { ToastState } from './AdminToast'
import { useI18n } from '@/lib/i18n'

interface User {
  id: string
  email: string
  name: string | null
  role: string
  disabled: boolean
  status: 'active' | 'pending_approval' | 'pending_verification'
  created_at: string
}

interface UsersPage {
  users: User[]
  total: number
  page: number
  pageSize: number
}

interface Props {
  initial: UsersPage
  currentUserId: string
}

const SEARCH_DEBOUNCE_MS = 300

function Switch({ on, onClick, disabled, title, label }: {
  on: boolean; onClick: () => void; disabled?: boolean; title: string; label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`w-10 h-5 rounded-full transition-colors disabled:opacity-40 ${on ? 'bg-primary' : 'bg-outline-variant/40'}`}
      title={title}
    >
      <span className={`block w-3.5 h-3.5 rounded-full bg-white shadow transition-transform mx-0.5 ${on ? 'translate-x-[1.3rem]' : 'translate-x-0'}`} />
    </button>
  )
}

export function UserList({ initial, currentUserId }: Props) {
  const { t } = useI18n()
  const [data, setData]           = useState<UsersPage>(initial)
  const [page, setPage]           = useState(initial.page)
  const [search, setSearch]       = useState('')
  const [query, setQuery]         = useState('')   // search term actually applied (debounced)
  const [busy, setBusy]           = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [confirmResetId, setConfirmResetId] = useState<string | null>(null)
  const [resetResult, setResetResult] = useState<{ email: string; password: string } | null>(null)
  const [copied, setCopied]       = useState(false)
  const [inviting, setInviting]   = useState(false)
  const [invite, setInvite]       = useState({ email: '', name: '', admin: false })
  const [inviteBusy, setInviteBusy] = useState(false)
  const [toast, setToast]         = useState<ToastState>(null)
  const requestId                 = useRef(0)
  const firstLoad                 = useRef(true)

  const errorMessage = useCallback((code?: string) => {
    switch (code) {
      case 'self':        return t.userList.errSelf
      case 'last_admin':  return t.userList.errLastAdmin
      case 'not_found':   return t.userList.errNotFound
      case 'not_pending': return t.userList.errNotPending
      case 'exists':      return t.userList.errExists
      case 'invalid_email': return t.userList.errInvalidEmail
      case 'domain_not_allowed': return t.userList.errDomainNotAllowed
      default:            return t.userList.toastError
    }
  }, [t])

  const load = useCallback(async (p: number, q: string) => {
    const id = ++requestId.current
    try {
      const res = await fetch(`/api/admin/users?page=${p}&pageSize=${initial.pageSize}&q=${encodeURIComponent(q)}`, { cache: 'no-store' })
      if (!res.ok) throw new Error()
      const json: UsersPage = await res.json()
      if (id !== requestId.current) return // a newer request is on its way
      setData(json)
      setPage(json.page)
    } catch {
      if (id === requestId.current) setToast({ message: t.userList.networkError, type: 'error' })
    }
  }, [initial.pageSize, t])

  // Debounce the search box; a new search goes back to page 1
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    // The server already rendered the first page
    if (firstLoad.current) { firstLoad.current = false; return }
    load(page, query)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, page])

  function changeSearch(value: string) {
    setSearch(value)
    setPage(1)
  }

  async function send(user: User, method: 'PATCH' | 'DELETE' | 'POST', body?: object, pathSuffix = ''): Promise<boolean> {
    setBusy(user.id)
    try {
      const res = await fetch(`/api/admin/users/${user.id}${pathSuffix}`, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setToast({ message: errorMessage(json.code), type: 'error' })
        return false
      }
      return true
    } catch {
      setToast({ message: t.userList.networkError, type: 'error' })
      return false
    } finally {
      setBusy(null)
    }
  }

  async function toggleRole(user: User) {
    const role = user.role === 'admin' ? 'user' : 'admin'
    if (!await send(user, 'PATCH', { role })) return
    setData(d => ({ ...d, users: d.users.map(u => u.id === user.id ? { ...u, role } : u) }))
    setToast({ message: t.userList.toastRoleUpdated.replace('{0}', user.email), type: 'success' })
  }

  async function toggleActive(user: User) {
    const disabled = !user.disabled
    if (!await send(user, 'PATCH', { disabled })) return
    setData(d => ({ ...d, users: d.users.map(u => u.id === user.id ? { ...u, disabled } : u) }))
    setToast({ message: (disabled ? t.userList.toastDisabled : t.userList.toastEnabled).replace('{0}', user.email), type: 'success' })
  }

  async function remove(user: User) {
    setConfirmId(null)
    if (!await send(user, 'DELETE')) return
    setToast({ message: t.userList.toastDeleted.replace('{0}', user.email), type: 'success' })
    // Reload: the page may now be short or empty
    await load(page, query)
  }

  async function approve(user: User) {
    if (!await send(user, 'POST', undefined, '/approve')) return
    setData(d => ({ ...d, users: d.users.map(u => u.id === user.id ? { ...u, status: 'active' } : u) }))
    setToast({ message: t.userList.toastApproved.replace('{0}', user.email), type: 'success' })
  }

  async function reject(user: User) {
    if (!await send(user, 'POST', undefined, '/reject')) return
    setToast({ message: t.userList.toastRejected.replace('{0}', user.email), type: 'success' })
    // Reload: the page may now be short or empty
    await load(page, query)
  }

  async function resetPassword(user: User) {
    setConfirmResetId(null)
    setBusy(user.id)
    try {
      const res = await fetch(`/api/admin/users/${user.id}/reset-password`, { method: 'POST' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setToast({ message: errorMessage(json.code), type: 'error' })
        return
      }
      // Le mot de passe n'est jamais renvoyé une deuxième fois : affiché une fois dans une modale, pas un toast
      // qui disparaîtrait tout seul avant que l'admin ait pu le copier.
      setResetResult({ email: json.email, password: json.password })
    } catch {
      setToast({ message: t.userList.networkError, type: 'error' })
    } finally {
      setBusy(null)
    }
  }

  async function copyResetPassword() {
    if (!resetResult) return
    try {
      await navigator.clipboard.writeText(resetResult.password)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard indisponible (contexte non sécurisé, permission…) : le mot de passe reste sélectionnable à la main */ }
  }

  const lastPage = Math.max(Math.ceil(data.total / data.pageSize), 1)
  async function submitInvite(e: React.FormEvent) {
    e.preventDefault()
    setInviteBusy(true)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: invite.email, name: invite.name || undefined, role: invite.admin ? 'admin' : 'user' }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setToast({ message: errorMessage(json.code), type: 'error' })
        return
      }
      setToast({ message: t.userList.toastInvited.replace('{0}', json.user.email), type: 'success' })
      setInvite({ email: '', name: '', admin: false })
      setInviting(false)
      await load(page, query)
    } catch {
      setToast({ message: t.userList.networkError, type: 'error' })
    } finally {
      setInviteBusy(false)
    }
  }

  const from = data.total === 0 ? 0 : (data.page - 1) * data.pageSize + 1
  const to   = Math.min(data.page * data.pageSize, data.total)
  const th   = 'px-5 py-3 text-xs font-semibold text-on-surface-variant uppercase tracking-wider'

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
      <div className="relative w-full max-w-sm">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[1.1rem] text-on-surface-variant pointer-events-none" aria-hidden="true">search</span>
        <input
          type="search"
          value={search}
          onChange={e => changeSearch(e.target.value)}
          placeholder={t.userList.searchPlaceholder}
          aria-label={t.userList.searchPlaceholder}
          className="w-full pl-10 pr-3 py-2 text-sm rounded-lg border border-outline-variant/30 bg-surface-container-lowest text-on-surface focus:outline-none focus:border-primary"
        />
      </div>
      <div className="flex-1" />
      <button type="button" onClick={() => setInviting(v => !v)} className="action-btn">
        <span className="material-symbols-outlined text-[0.95rem] leading-none" aria-hidden="true">person_add</span>
        {t.userList.inviteButton}
      </button>
      </div>

      {inviting && (
        <form onSubmit={submitInvite} className="mb-4 bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[14rem]">
            <label className="block text-xs text-on-surface-variant mb-1">{t.userList.inviteEmail}</label>
            <input type="email" required value={invite.email} onChange={e => setInvite(v => ({ ...v, email: e.target.value }))} autoComplete="off"
              className="w-full px-3 py-2 text-sm rounded-lg border border-outline-variant/30 bg-surface-container text-on-surface focus:outline-none focus:border-primary" />
          </div>
          <div className="flex-1 min-w-[12rem]">
            <label className="block text-xs text-on-surface-variant mb-1">{t.userList.inviteName}</label>
            <input type="text" value={invite.name} onChange={e => setInvite(v => ({ ...v, name: e.target.value }))} maxLength={120} autoComplete="off"
              className="w-full px-3 py-2 text-sm rounded-lg border border-outline-variant/30 bg-surface-container text-on-surface focus:outline-none focus:border-primary" />
          </div>
          <label className="flex items-center gap-2 text-sm text-on-surface pb-2">
            <input type="checkbox" checked={invite.admin} onChange={e => setInvite(v => ({ ...v, admin: e.target.checked }))} />
            {t.userList.inviteAdmin}
          </label>
          <div className="flex items-center gap-2">
            <button type="submit" disabled={inviteBusy || !invite.email} className="action-btn disabled:opacity-40">{t.userList.inviteSubmit}</button>
            <button type="button" onClick={() => setInviting(false)} className="text-button">{t.userList.inviteCancel}</button>
          </div>
        </form>
      )}

      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 overflow-x-auto overflow-y-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-outline-variant/10">
              <th className={`text-left ${th}`}>{t.userList.colUser}</th>
              <th className={`text-left hidden sm:table-cell ${th}`}>{t.userList.colCreatedAt}</th>
              <th className={`text-center ${th}`}>{t.userList.colActive}</th>
              <th className={`text-center ${th}`}>{t.userList.colAdminRole}</th>
              <th className={`text-right ${th}`}><span className="sr-only">{t.userList.colActions}</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/10">
            {data.users.length === 0 && (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-xs text-on-surface-variant">{t.userList.empty}</td></tr>
            )}
            {data.users.map(user => {
              const isSelf = user.id === currentUserId
              const isPending = user.status !== 'active'
              return (
                <tr key={user.id} className={isSelf ? 'bg-primary/5' : ''}>
                  <td className="px-5 py-3.5">
                    <div className={`flex items-center gap-3 ${user.disabled ? 'opacity-50' : ''}`}>
                      <div className="w-8 h-8 rounded-full bg-primary-container flex items-center justify-center shrink-0">
                        <span className="font-headline font-bold text-xs text-on-primary-container leading-none">
                          {(user.name ?? user.email)[0].toUpperCase()}
                        </span>
                      </div>
                      <div>
                        {user.name && <p className="font-medium text-on-surface text-xs">{user.name}</p>}
                        <p className="text-on-surface-variant text-xs">{user.email}</p>
                        {isSelf && <span className="text-xs text-primary">{t.userList.you}</span>}
                        {user.disabled && <span className="text-xs text-error">{t.userList.disabledBadge}</span>}
                        {user.status === 'pending_approval' && <span className="text-xs text-primary">{t.userList.pendingApprovalBadge}</span>}
                        {user.status === 'pending_verification' && <span className="text-xs text-primary">{t.userList.pendingVerificationBadge}</span>}
                      </div>
                    </div>
                  </td>
                  {/* Date format follows the browser locale, which the server cannot know: text differs on first render */}
                  <td className="px-5 py-3.5 text-xs text-on-surface-variant hidden sm:table-cell" suppressHydrationWarning>
                    {new Date(user.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <Switch
                      on={!user.disabled}
                      onClick={() => toggleActive(user)}
                      disabled={busy === user.id || isSelf || isPending}
                      title={user.disabled ? t.userList.enable : t.userList.disable}
                      label={t.userList.colActive}
                    />
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <Switch
                      on={user.role === 'admin'}
                      onClick={() => toggleRole(user)}
                      disabled={busy === user.id || (isSelf && user.role === 'admin') || isPending}
                      title={user.role === 'admin' ? t.userList.demote : t.userList.promote}
                      label={t.userList.colAdminRole}
                    />
                  </td>
                  <td className="px-5 py-3.5 text-right whitespace-nowrap">
                    {user.status === 'pending_approval' ? (
                      <span className="inline-flex items-center gap-2 text-xs">
                        <button type="button" onClick={() => approve(user)} disabled={busy === user.id} className="text-primary font-semibold hover:underline disabled:opacity-40">{t.userList.approve}</button>
                        <button type="button" onClick={() => reject(user)} disabled={busy === user.id} className="text-error font-semibold hover:underline disabled:opacity-40">{t.userList.reject}</button>
                      </span>
                    ) : confirmId === user.id ? (
                      <span className="inline-flex items-center gap-2 text-xs">
                        <button type="button" onClick={() => remove(user)} className="text-error font-semibold hover:underline">{t.userList.confirmDelete}</button>
                        <button type="button" onClick={() => setConfirmId(null)} className="text-on-surface-variant hover:underline">{t.userList.cancel}</button>
                      </span>
                    ) : confirmResetId === user.id ? (
                      <span className="inline-flex items-center gap-2 text-xs">
                        <button type="button" onClick={() => resetPassword(user)} className="text-primary font-semibold hover:underline">{t.userList.confirmResetPassword}</button>
                        <button type="button" onClick={() => setConfirmResetId(null)} className="text-on-surface-variant hover:underline">{t.userList.cancel}</button>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setConfirmResetId(user.id)}
                          disabled={busy === user.id}
                          className="icon-btn disabled:opacity-30"
                          title={t.userList.resetPassword}
                          aria-label={t.userList.resetPassword}
                        >
                          <span className="material-symbols-outlined text-[1.1rem] leading-none" aria-hidden="true">key</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmId(user.id)}
                          disabled={busy === user.id || isSelf}
                          className="icon-btn disabled:opacity-30"
                          title={t.userList.delete}
                          aria-label={t.userList.delete}
                        >
                          <span className="material-symbols-outlined text-[1.1rem] leading-none" aria-hidden="true">delete</span>
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-on-surface-variant">
        <span>{t.userList.range.replace('{0}', String(from)).replace('{1}', String(to)).replace('{2}', String(data.total))}</span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setPage(page - 1)} disabled={data.page <= 1} className="text-button disabled:opacity-40">{t.userList.prev}</button>
          <span>{t.userList.pageOf.replace('{0}', String(data.page)).replace('{1}', String(lastPage))}</span>
          <button type="button" onClick={() => setPage(page + 1)} disabled={data.page >= lastPage} className="text-button disabled:opacity-40">{t.userList.next}</button>
        </div>
      </div>

      <p className="mt-4 text-xs text-on-surface-variant max-w-2xl">{t.userList.deleteHint}</p>

      {resetResult && (
        <div
          className="fixed inset-0 z-[500] flex items-center justify-center bg-black/40 p-4"
          onClick={() => setResetResult(null)}
        >
          <div
            className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-6 max-w-sm w-full shadow-lg"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="font-headline font-semibold text-base text-on-surface mb-2">{t.userList.resetPasswordModalTitle}</h3>
            <p className="text-sm text-on-surface-variant mb-4">{t.userList.resetPasswordModalDesc.replace('{0}', resetResult.email)}</p>
            <div className="flex items-center gap-2 mb-5">
              <code className="flex-1 px-3 py-2 rounded-lg bg-surface-container text-sm text-on-surface break-all select-all">
                {resetResult.password}
              </code>
              <button
                type="button"
                onClick={copyResetPassword}
                className="icon-btn shrink-0"
                title={t.userList.copyPassword}
                aria-label={t.userList.copyPassword}
              >
                <span className="material-symbols-outlined text-[1.1rem] leading-none" aria-hidden="true">
                  {copied ? 'check' : 'content_copy'}
                </span>
              </button>
            </div>
            <div className="flex justify-end">
              <button type="button" onClick={() => setResetResult(null)} className="action-btn">
                {t.userList.close}
              </button>
            </div>
          </div>
        </div>
      )}

      <AdminToast toast={toast} onDismiss={() => setToast(null)} />
    </>
  )
}

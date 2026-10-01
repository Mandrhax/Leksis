'use client'

import { createContext, useCallback, useContext, useEffect, useRef } from 'react'
import { useI18n } from '@/lib/i18n'

interface AdminDirtyContextValue {
  registerDirty: (id: string, dirty: boolean) => void
  confirmLeave: () => boolean
}

const AdminDirtyContext = createContext<AdminDirtyContextValue | null>(null)

/** Wraps the admin shell: warns before a full page unload/reload and exposes
 *  `confirmLeave()` for in-app navigation while an admin form has unsaved edits. */
export function AdminDirtyProvider({ children }: { children: React.ReactNode }) {
  const { t } = useI18n()
  const dirtyIds = useRef<Set<string>>(new Set())

  const registerDirty = useCallback((id: string, dirty: boolean) => {
    if (dirty) dirtyIds.current.add(id)
    else dirtyIds.current.delete(id)
  }, [])

  const confirmLeave = useCallback(() => {
    if (dirtyIds.current.size === 0) return true
    return window.confirm(t.adminDirty.confirmLeave)
  }, [t])

  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (dirtyIds.current.size === 0) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  return (
    <AdminDirtyContext.Provider value={{ registerDirty, confirmLeave }}>
      {children}
    </AdminDirtyContext.Provider>
  )
}

/** Call with a stable `id` and the current dirty flag for one form/section. */
export function useAdminDirtyRegister(id: string, dirty: boolean) {
  const ctx = useContext(AdminDirtyContext)
  useEffect(() => {
    ctx?.registerDirty(id, dirty)
    return () => ctx?.registerDirty(id, false)
  }, [ctx, id, dirty])
}

/** Returns a guard to call before an in-app navigation: resolves `true` if it's
 *  safe to proceed (nothing dirty, or the admin confirmed leaving anyway). */
export function useAdminLeaveGuard(): () => boolean {
  const ctx = useContext(AdminDirtyContext)
  return ctx?.confirmLeave ?? (() => true)
}

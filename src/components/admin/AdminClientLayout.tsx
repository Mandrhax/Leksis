'use client'

import { useState } from 'react'
import { I18nProvider } from '@/lib/i18n'
import { AdminDirtyProvider } from '@/lib/admin-dirty'
import { UILanguageSwitcher } from '@/components/ui/UILanguageSwitcher'
import { AccountMenu } from '@/components/ui/AccountMenu'
import { AdminSidebar } from '@/components/admin/AdminSidebar'

function AdminShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="h-screen overflow-hidden flex flex-col md:flex-row relative" style={{ background: '#f7f9fb' }}>
      {/* Mobile top bar */}
      <header className="flex md:hidden items-center h-14 px-4 bg-surface-container-lowest border-b border-outline-variant/10 shrink-0 z-20">
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className="icon-btn mr-3"
          aria-label="Open menu"
        >
          <span className="material-symbols-outlined text-[1.3rem] leading-none" aria-hidden="true">menu</span>
        </button>
        <span className="font-headline font-bold text-sm text-on-surface flex-1">Admin</span>
        <div className="flex items-center gap-1">
          <UILanguageSwitcher />
          <AccountMenu />
        </div>
      </header>

      {/* Overlay (mobile only) */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex-1 min-h-0 overflow-auto">
        {children}
      </main>

      {/* Desktop controls */}
      <div className="hidden md:flex items-center gap-1 absolute right-4 top-4 z-50">
        <UILanguageSwitcher />
        <AccountMenu />
      </div>
    </div>
  )
}

export function AdminClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <AdminDirtyProvider>
        <AdminShell>{children}</AdminShell>
      </AdminDirtyProvider>
    </I18nProvider>
  )
}

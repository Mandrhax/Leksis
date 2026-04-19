'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useI18n } from '@/lib/i18n'

type ServiceKey = 'ollama' | 'db' | 'caddy'
type ServiceStatus = Record<ServiceKey, boolean | null>

function useServiceStatus(): ServiceStatus {
  const [status, setStatus] = useState<ServiceStatus>({ ollama: null, db: null, caddy: null })

  useEffect(() => {
    async function check(key: ServiceKey, url: string) {
      try {
        const res = await fetch(url, { cache: 'no-store' })
        const data = await res.json()
        setStatus(prev => ({ ...prev, [key]: data.reachable ?? data.ok ?? true }))
      } catch {
        setStatus(prev => ({ ...prev, [key]: false }))
      }
    }
    check('ollama', '/api/admin/services/ollama/metrics')
    check('db',     '/api/admin/services/db/metrics')
    check('caddy',  '/api/admin/services/caddy/metrics')
  }, [])

  return status
}

function StatusDot({ ok }: { ok: boolean | null }) {
  if (ok === null) return <span className="w-1.5 h-1.5 rounded-full bg-outline-variant/40 inline-block flex-shrink-0" />
  return (
    <span
      className={`w-1.5 h-1.5 rounded-full inline-block flex-shrink-0 ${ok ? 'bg-[#27ae60]' : 'bg-error'}`}
      style={{ boxShadow: ok ? '0 0 0 2px rgba(39,174,96,0.18)' : '0 0 0 2px rgba(159,64,61,0.18)' }}
    />
  )
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="px-3 pt-3 pb-1 text-[9.5px] font-bold uppercase tracking-[0.1em] text-on-surface-variant/50 select-none">
      {children}
    </div>
  )
}

export function AdminSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname()
  const { t } = useI18n()
  const svcStatus = useServiceStatus()

  function NavLink({
    href,
    icon,
    label,
    statusKey,
    exact = false,
  }: {
    href: string
    icon: string
    label: string
    statusKey?: ServiceKey
    exact?: boolean
  }) {
    const active = exact ? pathname === href : pathname.startsWith(href)
    return (
      <Link
        href={href}
        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
          active
            ? 'bg-primary/10 text-primary font-semibold'
            : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
        }`}
      >
        <span className="material-symbols-outlined text-[1.05rem] leading-none flex-shrink-0" aria-hidden="true">
          {icon}
        </span>
        <span className="flex-1">{label}</span>
        {statusKey !== undefined && <StatusDot ok={svcStatus[statusKey]} />}
      </Link>
    )
  }

  return (
    <aside className={`fixed inset-y-0 left-0 z-40 w-56 shrink-0 bg-surface-container-lowest border-r border-outline-variant/10 flex flex-col transition-transform duration-200 ease-in-out md:relative md:translate-x-0 md:z-auto ${open ? 'translate-x-0' : '-translate-x-full'}`}>
      {/* Header */}
      <div className="px-5 py-4 border-b border-outline-variant/10">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-xl leading-none" aria-hidden="true">
            admin_panel_settings
          </span>
          <span className="font-headline font-bold text-sm text-on-surface flex-1">{t.adminSidebar.title}</span>
          <button
            type="button"
            onClick={onClose}
            className="icon-btn md:hidden"
            aria-label="Close menu"
          >
            <span className="material-symbols-outlined text-[1.1rem] leading-none" aria-hidden="true">close</span>
          </button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-2 flex flex-col overflow-y-auto" aria-label={t.adminSidebar.navLabel}>
        <NavLink href="/admin/dashboard" icon="home" label={t.adminSidebar.navDashboard} />

        <SectionLabel>{t.adminSidebar.navSectionSettings}</SectionLabel>
        <NavLink href="/admin/settings" icon="settings" label={t.adminSidebar.navSettings} />

        <SectionLabel>{t.adminSidebar.navSectionInfrastructure}</SectionLabel>
        <NavLink href="/admin/services/ai"    icon="smart_toy" label={t.adminSidebar.navServicesAI}    statusKey="ollama" />
        <NavLink href="/admin/services/db"    icon="storage"   label={t.adminSidebar.navServicesDb}    statusKey="db"     />
        <NavLink href="/admin/services/caddy" icon="router"    label={t.adminSidebar.navServicesCaddy} statusKey="caddy"  />

        <SectionLabel>{t.adminSidebar.navSectionManagement}</SectionLabel>
        <NavLink href="/admin/users"    icon="group"          label={t.adminSidebar.navUsers}    />
        <NavLink href="/admin/glossary" icon="menu_book"      label={t.adminSidebar.navGlossary} />
        <NavLink href="/admin/usage"    icon="bar_chart"      label={t.adminSidebar.navUsage}    />
        <NavLink href="/admin/audit"    icon="manage_history" label={t.adminSidebar.navAudit}    />
        <NavLink href="/admin/backup"   icon="cloud_download" label={t.adminSidebar.navBackup}   />
      </nav>

      {/* Back to app */}
      <div className="p-2 border-t border-outline-variant/10">
        <Link
          href="/"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors"
        >
          <span className="material-symbols-outlined text-[1.05rem] leading-none" aria-hidden="true">
            arrow_back
          </span>
          {t.adminSidebar.backToApp}
        </Link>
      </div>
    </aside>
  )
}

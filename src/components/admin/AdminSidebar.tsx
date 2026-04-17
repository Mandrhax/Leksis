'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useI18n } from '@/lib/i18n'

export function AdminSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname()
  const { t } = useI18n()

  const TOP_ITEMS = [
    { href: '/admin/settings', icon: 'palette',        label: t.adminSidebar.navSettings },
  ]

  const SERVICES_SUB = [
    { href: '/admin/services/ai',    icon: 'smart_toy', label: t.adminSidebar.navServicesAI    },
    { href: '/admin/services/db',    icon: 'storage',   label: t.adminSidebar.navServicesDb    },
    { href: '/admin/services/caddy', icon: 'router',    label: t.adminSidebar.navServicesCaddy },
  ]

  const BOTTOM_ITEMS = [
    { href: '/admin/users',     icon: 'group',           label: t.adminSidebar.navUsers    },
    { href: '/admin/glossary',  icon: 'menu_book',       label: t.adminSidebar.navGlossary },
    { href: '/admin/usage',     icon: 'bar_chart',       label: t.adminSidebar.navUsage    },
    { href: '/admin/audit',     icon: 'manage_history',  label: t.adminSidebar.navAudit    },
    { href: '/admin/backup',    icon: 'cloud_download',  label: t.adminSidebar.navBackup   },
  ]

  const servicesActive = pathname.startsWith('/admin/services')

  function NavLink({ href, icon, label }: { href: string; icon: string; label: string }) {
    const active = pathname.startsWith(href)
    return (
      <Link
        href={href}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
          active
            ? 'bg-primary/10 text-primary font-medium'
            : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
        }`}
      >
        <span className="material-symbols-outlined text-[1.1rem] leading-none" aria-hidden="true">
          {icon}
        </span>
        {label}
      </Link>
    )
  }

  return (
    <aside className={`fixed inset-y-0 left-0 z-40 w-56 shrink-0 bg-surface-container-lowest border-r border-outline-variant/10 flex flex-col transition-transform duration-200 ease-in-out md:relative md:translate-x-0 md:z-auto ${open ? 'translate-x-0' : '-translate-x-full'}`}>
      {/* Logo / titre */}
      <div className="px-5 py-5 border-b border-outline-variant/10">
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
      <nav className="flex-1 p-3 flex flex-col gap-1" aria-label={t.adminSidebar.navLabel}>
        {TOP_ITEMS.map(item => <NavLink key={item.href} {...item} />)}

        {/* Services — section header + sub-items */}
        <div>
          <div className={`flex items-center gap-3 px-3 py-2.5 text-sm select-none ${
            servicesActive ? 'text-on-surface font-medium' : 'text-on-surface-variant'
          }`}>
            <span className="material-symbols-outlined text-[1.1rem] leading-none" aria-hidden="true">dns</span>
            {t.adminSidebar.navServices}
          </div>
          <div className="ml-4 flex flex-col gap-0.5">
            {SERVICES_SUB.map(item => <NavLink key={item.href} {...item} />)}
          </div>
        </div>

        {BOTTOM_ITEMS.map(item => <NavLink key={item.href} {...item} />)}
      </nav>

      {/* Retour à l'app */}
      <div className="p-3 border-t border-outline-variant/10">
        <Link
          href="/"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors"
        >
          <span className="material-symbols-outlined text-[1.1rem] leading-none" aria-hidden="true">
            arrow_back
          </span>
          {t.adminSidebar.backToApp}
        </Link>
      </div>
    </aside>
  )
}

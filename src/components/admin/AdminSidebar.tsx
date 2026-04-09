'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useI18n } from '@/lib/i18n'

export function AdminSidebar() {
  const pathname = usePathname()
  const { t } = useI18n()

  const NAV_ITEMS = [
    { href: '/admin/settings', icon: 'palette',         label: t.adminSidebar.navSettings },
    { href: '/admin/services', icon: 'dns',             label: t.adminSidebar.navServices },
    { href: '/admin/users',    icon: 'group',           label: t.adminSidebar.navUsers    },
    { href: '/admin/usage',    icon: 'bar_chart',       label: t.adminSidebar.navUsage    },
    { href: '/admin/audit',    icon: 'manage_history',  label: t.adminSidebar.navAudit    },
  ]

  return (
    <aside className="w-56 shrink-0 bg-surface-container-lowest border-r border-outline-variant/10 min-h-screen flex flex-col">
      {/* Logo / titre */}
      <div className="px-5 py-5 border-b border-outline-variant/10">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-xl leading-none" aria-hidden="true">
            admin_panel_settings
          </span>
          <span className="font-headline font-bold text-sm text-on-surface">{t.adminSidebar.title}</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 flex flex-col gap-1" aria-label={t.adminSidebar.navLabel}>
        {NAV_ITEMS.map(item => {
          const active = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                active
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[1.1rem] leading-none" aria-hidden="true">
                {item.icon}
              </span>
              {item.label}
            </Link>
          )
        })}
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

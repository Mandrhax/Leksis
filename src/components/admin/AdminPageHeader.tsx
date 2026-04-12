'use client'

import { useI18n } from '@/lib/i18n'

type AdminSection = 'settings' | 'services' | 'users' | 'usage' | 'audit' | 'backup'

export function AdminPageHeader({ section }: { section: AdminSection }) {
  const { t } = useI18n()

  const titles: Record<AdminSection, string> = {
    settings: t.adminPages.settingsTitle,
    services: t.adminPages.servicesTitle,
    users:    t.adminPages.usersTitle,
    usage:    t.adminPages.usageTitle,
    audit:    t.adminPages.auditTitle,
    backup:   t.adminPages.backupTitle,
  }
  const descs: Record<AdminSection, string> = {
    settings: t.adminPages.settingsDesc,
    services: t.adminPages.servicesDesc,
    users:    t.adminPages.usersDesc,
    usage:    t.adminPages.usageDesc,
    audit:    t.adminPages.auditDesc,
    backup:   t.adminPages.backupDesc,
  }

  return (
    <div className="mb-8">
      <h1 className="font-headline font-bold text-xl text-on-surface">{titles[section]}</h1>
      <p className="text-sm text-on-surface-variant mt-1">{descs[section]}</p>
    </div>
  )
}

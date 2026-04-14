'use client'

import { useI18n } from '@/lib/i18n'

type AdminSection = 'settings' | 'services' | 'servicesAi' | 'servicesDb' | 'users' | 'glossary' | 'usage' | 'audit' | 'backup'

export function AdminPageHeader({ section }: { section: AdminSection }) {
  const { t } = useI18n()

  const titles: Record<AdminSection, string> = {
    settings:   t.adminPages.settingsTitle,
    services:   t.adminPages.servicesTitle,
    servicesAi: t.adminPages.servicesAiTitle,
    servicesDb: t.adminPages.servicesDbTitle,
    users:      t.adminPages.usersTitle,
    glossary:   t.adminPages.glossaryTitle,
    usage:      t.adminPages.usageTitle,
    audit:      t.adminPages.auditTitle,
    backup:     t.adminPages.backupTitle,
  }
  const descs: Record<AdminSection, string> = {
    settings:   t.adminPages.settingsDesc,
    services:   t.adminPages.servicesDesc,
    servicesAi: t.adminPages.servicesAiDesc,
    servicesDb: t.adminPages.servicesDbDesc,
    users:      t.adminPages.usersDesc,
    glossary:   t.adminPages.glossaryDesc,
    usage:      t.adminPages.usageDesc,
    audit:      t.adminPages.auditDesc,
    backup:     t.adminPages.backupDesc,
  }

  return (
    <div className="mb-8">
      <h1 className="font-headline font-bold text-xl text-on-surface">{titles[section]}</h1>
      <p className="text-sm text-on-surface-variant mt-1">{descs[section]}</p>
    </div>
  )
}

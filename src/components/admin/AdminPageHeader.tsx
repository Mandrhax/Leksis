'use client'

import { useI18n } from '@/lib/i18n'

type AdminSection = 'settings' | 'services' | 'servicesAi' | 'servicesDb' | 'servicesCaddy' | 'users' | 'glossary' | 'usage' | 'audit' | 'backup' | 'docs'

export function AdminPageHeader({ section }: { section: AdminSection }) {
  const { t } = useI18n()

  const titles: Record<AdminSection, string> = {
    settings:   t.adminPages.settingsTitle,
    services:   t.adminPages.servicesTitle,
    servicesAi: t.adminPages.servicesAiTitle,
    servicesDb:    t.adminPages.servicesDbTitle,
    servicesCaddy: t.adminPages.servicesCaddyTitle,
    users:      t.adminPages.usersTitle,
    glossary:   t.adminPages.glossaryTitle,
    usage:      t.adminPages.usageTitle,
    audit:      t.adminPages.auditTitle,
    backup:     t.adminPages.backupTitle,
    docs:       t.adminPages.docsTitle,
  }
  const descs: Record<AdminSection, string> = {
    settings:   t.adminPages.settingsDesc,
    services:   t.adminPages.servicesDesc,
    servicesAi: t.adminPages.servicesAiDesc,
    servicesDb:    t.adminPages.servicesDbDesc,
    servicesCaddy: t.adminPages.servicesCaddyDesc,
    users:      t.adminPages.usersDesc,
    glossary:   t.adminPages.glossaryDesc,
    usage:      t.adminPages.usageDesc,
    audit:      t.adminPages.auditDesc,
    backup:     t.adminPages.backupDesc,
    docs:       t.adminPages.docsDesc,
  }

  return (
    <div className="mb-8 pb-5 border-b border-outline-variant/15">
      <h1 className="font-headline font-bold text-xl tracking-tight text-on-surface">{titles[section]}</h1>
      <p className="text-sm text-on-surface-variant mt-1 max-w-3xl text-pretty">{descs[section]}</p>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { BrandingForm }  from './BrandingForm'
import { DesignForm }    from './DesignForm'
import { GeneralForm }   from './GeneralForm'
import { FeaturesForm }  from './FeaturesForm'
import { TonesForm }     from './TonesForm'
import type { ToneConfig } from '@/types/leksis'
import { AdminToast }    from './AdminToast'
import type { ToastState } from './AdminToast'
import { useI18n } from '@/lib/i18n'

interface Props {
  settings: Record<string, unknown>
}

function AccordionSection({
  icon,
  title,
  badge,
  defaultOpen,
  children,
}: {
  icon: string
  title: string
  badge: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen ?? false)

  return (
    <div className="rounded-xl border border-outline-variant/20 overflow-hidden bg-surface-container-lowest">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-surface-container-low transition-colors"
      >
        <span className="material-symbols-outlined text-[1.15rem] leading-none text-on-surface-variant flex-shrink-0" aria-hidden="true">
          {icon}
        </span>
        <span className="flex-1 font-headline font-semibold text-sm text-on-surface">{title}</span>
        <span className="text-[11px] font-medium text-on-surface-variant bg-surface-container px-2.5 py-0.5 rounded-full hidden sm:inline">
          {badge}
        </span>
        <span
          className="material-symbols-outlined text-[1.2rem] leading-none text-on-surface-variant/60 transition-transform duration-200 flex-shrink-0"
          style={{ transform: open ? 'rotate(180deg)' : 'none' }}
          aria-hidden="true"
        >
          expand_more
        </span>
      </button>

      {open && (
        <div className="border-t border-outline-variant/10 p-6">
          {children}
        </div>
      )}
    </div>
  )
}

export function SettingsAccordion({ settings }: Props) {
  const { t } = useI18n()
  const [toast, setToast]           = useState<ToastState>(null)
  const [confirming, setConfirming] = useState(false)
  const [resetting, setResetting]   = useState(false)

  async function handleReset() {
    if (!confirming) { setConfirming(true); return }
    setResetting(true)
    setConfirming(false)
    try {
      const res = await fetch('/api/admin/settings/reset', { method: 'POST' })
      if (!res.ok) throw new Error()
      setToast({ type: 'success', message: t.settingsTabs.toastSuccess })
      setTimeout(() => window.location.reload(), 800)
    } catch {
      setToast({ type: 'error', message: t.settingsTabs.toastError })
    } finally {
      setResetting(false)
    }
  }

  return (
    <>
      {/* Reset button row */}
      <div className="flex items-center justify-end mb-4 gap-2">
        {confirming && (
          <span className="text-xs text-on-surface-variant">{t.settingsTabs.confirmLabel}</span>
        )}
        {confirming && (
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="text-xs text-on-surface-variant hover:text-on-surface px-2 py-1 transition-colors"
          >
            {t.settingsTabs.cancelReset}
          </button>
        )}
        <button
          type="button"
          onClick={handleReset}
          disabled={resetting}
          className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-all ${
            confirming
              ? 'border-error/60 text-error bg-error/5 hover:bg-error/10'
              : 'border-outline-variant/30 text-on-surface-variant hover:text-on-surface hover:border-outline-variant/60'
          }`}
        >
          <span className="material-symbols-outlined text-sm leading-none" aria-hidden="true">
            {resetting ? 'hourglass_empty' : 'restart_alt'}
          </span>
          {confirming ? t.settingsTabs.confirmReset : t.settingsTabs.resetDefaults}
        </button>
      </div>

      {/* Accordion sections */}
      <div className="flex flex-col gap-3">
        <AccordionSection
          icon="palette"
          title={t.settingsTabs.sectionIdentity}
          badge={t.settingsTabs.sectionIdentityBadge}
          defaultOpen
        >
          <BrandingForm initial={settings.branding as never ?? {}} onToast={setToast} />
        </AccordionSection>

        <AccordionSection
          icon="brush"
          title={t.settingsTabs.sectionAppearance}
          badge={t.settingsTabs.sectionAppearanceBadge}
        >
          <DesignForm initial={settings.design as never ?? {}} onToast={setToast} />
        </AccordionSection>

        <AccordionSection
          icon="tune"
          title={t.settingsTabs.sectionFeatures}
          badge={t.settingsTabs.sectionFeaturesBadge}
        >
          <FeaturesForm initial={settings.features as never ?? {}} onToast={setToast} />
        </AccordionSection>

        <AccordionSection
          icon="auto_fix_high"
          title={t.settingsTabs.sectionTones}
          badge={t.settingsTabs.sectionTonesBadge}
        >
          <TonesForm initial={(settings.rewrite_tones as ToneConfig[] | undefined) ?? []} onToast={setToast} />
        </AccordionSection>

        <AccordionSection
          icon="lock"
          title={t.settingsTabs.sectionAccess}
          badge={t.settingsTabs.sectionAccessBadge}
        >
          <GeneralForm initial={settings.general as never ?? {}} onToast={setToast} />
        </AccordionSection>
      </div>

      <AdminToast toast={toast} onDismiss={() => setToast(null)} />
    </>
  )
}

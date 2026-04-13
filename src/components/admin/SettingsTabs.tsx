'use client'

import { useState } from 'react'
import { BrandingForm }      from './BrandingForm'
import { DesignForm }        from './DesignForm'
import { GeneralForm }       from './GeneralForm'
import { FeaturesForm }      from './FeaturesForm'
import { TonesForm }         from './TonesForm'
import type { ToneConfig } from '@/types/leksis'
import { AdminToast }        from './AdminToast'
import type { ToastState }   from './AdminToast'
import { useI18n } from '@/lib/i18n'

interface Props {
  settings: Record<string, unknown>
}

export function SettingsTabs({ settings }: Props) {
  const { t } = useI18n()
  const [active, setActive]         = useState('branding')
  const [toast, setToast]           = useState<ToastState>(null)
  const [confirming, setConfirming] = useState(false)
  const [resetting, setResetting]   = useState(false)

  const TABS = [
    { id: 'branding',  label: t.settingsTabs.tabBranding,  icon: 'palette'      },
    { id: 'design',    label: t.settingsTabs.tabDesign,     icon: 'brush'        },
    { id: 'features',  label: t.settingsTabs.tabFeatures,   icon: 'tune'         },
    { id: 'tones',     label: t.settingsTabs.tabTones,      icon: 'auto_fix_high'},
    { id: 'general',   label: t.settingsTabs.tabGeneral,    icon: 'lock'         },
  ]

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
      {/* Tabs + reset button */}
      <div className="flex items-center gap-1 border-b border-outline-variant/10 mb-6">
        {TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActive(tab.id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all -mb-px ${
              active === tab.id
                ? 'text-on-surface border-primary'
                : 'text-on-surface-variant border-transparent hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-base leading-none" aria-hidden="true">{tab.icon}</span>
            {tab.label}
          </button>
        ))}

        {/* Reset button — pushed to the right */}
        <div className="ml-auto flex items-center">
          {confirming && (
            <span className="text-xs text-on-surface-variant mr-2">{t.settingsTabs.confirmLabel}</span>
          )}
          <button
            type="button"
            onClick={confirming ? () => setConfirming(false) : undefined}
            className={`text-xs text-on-surface-variant hover:text-on-surface px-2 py-1 mr-1 transition-colors ${confirming ? 'block' : 'hidden'}`}
          >
            {t.settingsTabs.cancelReset}
          </button>
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
      </div>

      {/* Contenu */}
      {active === 'branding'  && <BrandingForm  initial={settings.branding  as never ?? {}} onToast={setToast} />}
      {active === 'design'    && <DesignForm    initial={settings.design    as never ?? {}} onToast={setToast} />}
      {active === 'features'  && <FeaturesForm  initial={settings.features  as never ?? {}} onToast={setToast} />}
      {active === 'tones'     && <TonesForm     initial={(settings.rewrite_tones as ToneConfig[] | undefined) ?? []} onToast={setToast} />}
      {active === 'general'   && <GeneralForm   initial={settings.general   as never ?? {}} onToast={setToast} />}

      <AdminToast toast={toast} onDismiss={() => setToast(null)} />
    </>
  )
}

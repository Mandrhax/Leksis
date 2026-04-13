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
      {/* Reset button — top right */}
      <div className="flex justify-end items-center gap-2 mb-6">
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

      {/* Grid layout — 2 columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Col 1 — row 1 */}
        <BrandingForm
          initial={settings.branding as never ?? {}}
          onToast={setToast}
        />

        {/* Col 2 — row 1: Design + General stacked */}
        <div className="flex flex-col gap-6">
          <DesignForm
            initial={settings.design as never ?? {}}
            onToast={setToast}
          />
          <GeneralForm
            initial={settings.general as never ?? {}}
            onToast={setToast}
          />
        </div>

        {/* Col 1 — row 2 */}
        <FeaturesForm
          initial={settings.features as never ?? {}}
          onToast={setToast}
        />

        {/* Col 2 — row 2 */}
        <TonesForm
          initial={(settings.rewrite_tones as ToneConfig[] | undefined) ?? []}
          onToast={setToast}
        />
      </div>

      <AdminToast toast={toast} onDismiss={() => setToast(null)} />
    </>
  )
}

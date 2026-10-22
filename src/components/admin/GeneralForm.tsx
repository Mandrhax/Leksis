'use client'

import { useEffect, useState } from 'react'
import type { ToastState } from './AdminToast'
import { useI18n } from '@/lib/i18n'
import { RETENTION_DEFAULTS, RETENTION_MAX_DAYS } from '@/lib/settings-schema'
import { useDirtyTracking } from '@/hooks/useDirtyTracking'

interface GeneralData {
  contactEmail: string
  globalBanner: string
  maintenanceMode: boolean
  maintenanceMessage: string
  usageRetentionDays: number
  auditRetentionDays: number
  feedbackRetentionDays: number
}

interface Props {
  initial: GeneralData
  onToast: (t: ToastState) => void
  onDirtyChange?: (dirty: boolean) => void
}

export function GeneralForm({ initial, onToast, onDirtyChange }: Props) {
  const { t } = useI18n()
  const [data, setData] = useState<GeneralData>({
    contactEmail: initial.contactEmail ?? '',
    globalBanner: initial.globalBanner ?? '',
    maintenanceMode: initial.maintenanceMode ?? false,
    maintenanceMessage: initial.maintenanceMessage ?? '',
    usageRetentionDays: initial.usageRetentionDays ?? RETENTION_DEFAULTS.usageRetentionDays,
    auditRetentionDays: initial.auditRetentionDays ?? RETENTION_DEFAULTS.auditRetentionDays,
    feedbackRetentionDays: initial.feedbackRetentionDays ?? RETENTION_DEFAULTS.feedbackRetentionDays,
  })
  const [saving, setSaving] = useState(false)
  const { dirty, markSaved } = useDirtyTracking(data)
  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'general', value: data }),
      })
      if (!res.ok) throw new Error()
      markSaved()
      onToast({ message: t.generalForm.toastSaved, type: 'success' })
    } catch {
      onToast({ message: t.generalForm.toastError, type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">

      {/* Colonne gauche */}
      <div className="flex flex-col gap-3">
      {/* Contact */}
      <div className="adm-card space-y-4">
        <h3 className="adm-eyebrow">{t.generalForm.sectionContact}</h3>
        <div>
          <label className="adm-label">{t.generalForm.contactEmailLabel}</label>
          <input
            type="email"
            value={data.contactEmail}
            onChange={e => setData(prev => ({ ...prev, contactEmail: e.target.value }))}
            className="adm-input"
            placeholder="support@example.com"
          />
        </div>
      </div>

      {/* Conservation des données */}
      <div className="adm-card space-y-4">
        <h3 className="adm-eyebrow">{t.generalForm.sectionRetention}</h3>
        {([
          ['usageRetentionDays', t.generalForm.usageRetentionLabel],
          ['auditRetentionDays', t.generalForm.auditRetentionLabel],
          ['feedbackRetentionDays', t.generalForm.feedbackRetentionLabel],
        ] as const).map(([field, label]) => (
          <div key={field}>
            <label className="adm-label">{label}</label>
            <input
              type="number"
              min={0}
              max={RETENTION_MAX_DAYS}
              step={1}
              value={data[field]}
              onChange={e => setData(prev => ({ ...prev, [field]: Math.min(Math.max(Math.trunc(Number(e.target.value)) || 0, 0), RETENTION_MAX_DAYS) }))}
              className="w-40 adm-input"
            />
          </div>
        ))}
        <p className="text-xs text-on-surface-variant">{t.generalForm.retentionHint}</p>
      </div>

      </div>{/* end left column */}

      {/* Colonne droite */}
      <div className="flex flex-col gap-3">
      {/* Bannière globale */}
      <div className="adm-card space-y-4">
        <h3 className="adm-eyebrow">{t.generalForm.sectionBanner}</h3>
        <div>
          <label className="adm-label">{t.generalForm.bannerLabel}</label>
          <textarea
            value={data.globalBanner}
            onChange={e => setData(prev => ({ ...prev, globalBanner: e.target.value }))}
            rows={2}
            className="adm-input resize-none"
            placeholder={t.generalForm.bannerPlaceholder}
          />
          <p className="text-xs text-on-surface-variant mt-1">{t.generalForm.bannerHint}</p>
        </div>
      </div>

      {/* Mode maintenance */}
      <div className="adm-card space-y-4">
        <h3 className="adm-eyebrow">{t.generalForm.sectionMaintenance}</h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-on-surface">{t.generalForm.maintenanceLabel}</p>
            <p className="text-xs text-on-surface-variant mt-0.5">{t.generalForm.maintenanceDesc}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={data.maintenanceMode}
            onClick={() => setData(prev => ({ ...prev, maintenanceMode: !prev.maintenanceMode }))}
            className={`w-11 h-6 rounded-full transition-colors ${data.maintenanceMode ? 'bg-error' : 'bg-outline-variant/40'}`}
          >
            <span className={`block w-4 h-4 rounded-full bg-white shadow transition-transform mx-1 ${data.maintenanceMode ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>
        {data.maintenanceMode && (
          <div>
            <label className="adm-label">{t.generalForm.maintenanceMsgLabel}</label>
            <textarea
              value={data.maintenanceMessage}
              onChange={e => setData(prev => ({ ...prev, maintenanceMessage: e.target.value }))}
              rows={3}
              className="adm-input resize-none"
              placeholder={t.generalForm.maintenanceMsgPlaceholder}
            />
          </div>
        )}
      </div>

      </div>{/* end right column */}

      </div>{/* end grid */}
      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving || !dirty} className="btn btn-primary">
          {saving ? (
            <span className="material-symbols-outlined animate-spin text-base leading-none" aria-hidden="true">progress_activity</span>
          ) : (
            <span className="material-symbols-outlined text-base leading-none" aria-hidden="true">save</span>
          )}
          {t.generalForm.save}
        </button>
      </div>
    </div>
  )
}

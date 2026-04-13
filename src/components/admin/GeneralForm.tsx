'use client'

import { useState } from 'react'
import type { ToastState } from './AdminToast'
import { useI18n } from '@/lib/i18n'

interface GeneralData {
  contactEmail: string
  globalBanner: string
  maintenanceMode: boolean
  maintenanceMessage: string
}

interface Props {
  initial: GeneralData
  onToast: (t: ToastState) => void
}

export function GeneralForm({ initial, onToast }: Props) {
  const { t } = useI18n()
  const [data, setData] = useState<GeneralData>({
    contactEmail: initial.contactEmail ?? '',
    globalBanner: initial.globalBanner ?? '',
    maintenanceMode: initial.maintenanceMode ?? false,
    maintenanceMessage: initial.maintenanceMessage ?? '',
  })
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'general', value: data }),
      })
      if (!res.ok) throw new Error()
      onToast({ message: t.generalForm.toastSaved, type: 'success' })
    } catch {
      onToast({ message: t.generalForm.toastError, type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
      {/* Contact */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-6 space-y-4">
        <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">{t.generalForm.sectionContact}</h3>
        <div>
          <label className="block text-sm text-on-surface mb-1.5">{t.generalForm.contactEmailLabel}</label>
          <input
            type="email"
            value={data.contactEmail}
            onChange={e => setData(prev => ({ ...prev, contactEmail: e.target.value }))}
            className="w-full bg-surface-container border border-outline-variant/20 rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary/50"
            placeholder="support@example.com"
          />
        </div>
      </div>

      {/* Bannière globale */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-6 space-y-4">
        <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">{t.generalForm.sectionBanner}</h3>
        <div>
          <label className="block text-sm text-on-surface mb-1.5">{t.generalForm.bannerLabel}</label>
          <textarea
            value={data.globalBanner}
            onChange={e => setData(prev => ({ ...prev, globalBanner: e.target.value }))}
            rows={2}
            className="w-full bg-surface-container border border-outline-variant/20 rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary/50 resize-none"
            placeholder={t.generalForm.bannerPlaceholder}
          />
          <p className="text-xs text-on-surface-variant mt-1">{t.generalForm.bannerHint}</p>
        </div>
      </div>

      {/* Mode maintenance */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-6 space-y-4">
        <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">{t.generalForm.sectionMaintenance}</h3>
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
            <label className="block text-sm text-on-surface mb-1.5">{t.generalForm.maintenanceMsgLabel}</label>
            <textarea
              value={data.maintenanceMessage}
              onChange={e => setData(prev => ({ ...prev, maintenanceMessage: e.target.value }))}
              rows={3}
              className="w-full bg-surface-container border border-outline-variant/20 rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary/50 resize-none"
              placeholder={t.generalForm.maintenanceMsgPlaceholder}
            />
          </div>
        )}
      </div>

      </div>{/* end grid */}
      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving} className="action-btn disabled:opacity-40">
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

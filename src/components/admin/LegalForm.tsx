'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { ToastState } from './AdminToast'
import { useI18n } from '@/lib/i18n'

interface LegalData {
  organization: string
  contact:      string
  privacyNotes: string
  usageRules:   string
}

interface Props {
  initial: Partial<LegalData>
  onToast: (t: ToastState) => void
}

const INPUT = 'w-full bg-surface-container border border-outline-variant/20 rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary/50'

export function LegalForm({ initial, onToast }: Props) {
  const { t } = useI18n()
  const lf = t.legalForm
  const [data, setData] = useState<LegalData>({
    organization: initial.organization ?? '',
    contact:      initial.contact      ?? '',
    privacyNotes: initial.privacyNotes ?? '',
    usageRules:   initial.usageRules   ?? '',
  })
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'legal', value: data }),
      })
      if (!res.ok) throw new Error()
      onToast({ message: lf.toastSaved, type: 'success' })
    } catch {
      onToast({ message: lf.toastError, type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">

        {/* Colonne gauche */}
        <div className="flex flex-col gap-3">
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-6 space-y-4">
            <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">{lf.sectionOrg}</h3>
            <div>
              <label className="block text-sm text-on-surface mb-1.5">{lf.organizationLabel}</label>
              <input
                type="text"
                maxLength={120}
                value={data.organization}
                onChange={e => setData(prev => ({ ...prev, organization: e.target.value }))}
                className={INPUT}
                placeholder={lf.organizationPlaceholder}
              />
            </div>
            <div>
              <label className="block text-sm text-on-surface mb-1.5">{lf.contactLabel}</label>
              <input
                type="text"
                maxLength={254}
                value={data.contact}
                onChange={e => setData(prev => ({ ...prev, contact: e.target.value }))}
                className={INPUT}
                placeholder={lf.contactPlaceholder}
              />
              <p className="text-xs text-on-surface-variant mt-1">{lf.contactHint}</p>
            </div>
          </div>

          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-6 space-y-3">
            <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">{lf.sectionPublished}</h3>
            <p className="text-xs text-on-surface-variant">{lf.publishedHint}</p>
            <div className="flex flex-wrap gap-4">
              <Link href="/legal/privacy" target="_blank" className="text-sm text-primary hover:underline">{t.legal.privacyLink}</Link>
              <Link href="/legal/usage"   target="_blank" className="text-sm text-primary hover:underline">{t.legal.usageLink}</Link>
            </div>
            <p className="text-xs text-on-surface-variant">{lf.disclaimer}</p>
          </div>
        </div>

        {/* Colonne droite */}
        <div className="flex flex-col gap-3">
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-6 space-y-4">
            <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">{lf.sectionNotes}</h3>
            <div>
              <label className="block text-sm text-on-surface mb-1.5">{lf.privacyNotesLabel}</label>
              <textarea
                rows={6}
                maxLength={5000}
                value={data.privacyNotes}
                onChange={e => setData(prev => ({ ...prev, privacyNotes: e.target.value }))}
                className={`${INPUT} resize-y`}
              />
            </div>
            <div>
              <label className="block text-sm text-on-surface mb-1.5">{lf.usageRulesLabel}</label>
              <textarea
                rows={6}
                maxLength={5000}
                value={data.usageRules}
                onChange={e => setData(prev => ({ ...prev, usageRules: e.target.value }))}
                className={`${INPUT} resize-y`}
              />
              <p className="text-xs text-on-surface-variant mt-1">{lf.notesHint}</p>
            </div>
          </div>
        </div>

      </div>
      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving} className="action-btn disabled:opacity-40">
          {saving ? (
            <span className="material-symbols-outlined animate-spin text-base leading-none" aria-hidden="true">progress_activity</span>
          ) : (
            <span className="material-symbols-outlined text-base leading-none" aria-hidden="true">save</span>
          )}
          {lf.save}
        </button>
      </div>
    </div>
  )
}

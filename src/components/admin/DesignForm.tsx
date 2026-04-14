'use client'

import { useState } from 'react'
import type { ToastState } from './AdminToast'
import { useI18n } from '@/lib/i18n'

interface DesignData {
  buttonRadius: string
  headerLogoSize: string
  footerText: string
  footerTextColor: string
  footerLinks: { label: string; url: string }[]
}

interface Props {
  initial: DesignData
  onToast: (t: ToastState) => void
}

export function DesignForm({ initial, onToast }: Props) {
  const { t } = useI18n()
  const [data, setData] = useState<DesignData>({
    buttonRadius: initial.buttonRadius ?? '0.75rem',
    headerLogoSize: initial.headerLogoSize ?? '32',
    footerText: initial.footerText ?? '',
    footerTextColor: initial.footerTextColor ?? '',
    footerLinks: initial.footerLinks ?? [],
  })
  const [saving, setSaving] = useState(false)

  function addFooterLink() {
    setData(prev => ({ ...prev, footerLinks: [...prev.footerLinks, { label: '', url: '' }] }))
  }

  function removeFooterLink(i: number) {
    setData(prev => ({ ...prev, footerLinks: prev.footerLinks.filter((_, idx) => idx !== i) }))
  }

  function updateFooterLink(i: number, field: 'label' | 'url', value: string) {
    setData(prev => ({
      ...prev,
      footerLinks: prev.footerLinks.map((l, idx) => idx === i ? { ...l, [field]: value } : l),
    }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'design', value: data }),
      })
      if (!res.ok) throw new Error()
      onToast({ message: t.designForm.toastSaved, type: 'success' })
    } catch {
      onToast({ message: t.designForm.toastError, type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const RADIUS_OPTIONS = [
    { label: t.designForm.radiusSquare,          value: '0.125rem' },
    { label: t.designForm.radiusSlightlyRounded,  value: '0.375rem' },
    { label: t.designForm.radiusRounded,          value: '0.75rem'  },
    { label: t.designForm.radiusPill,             value: '9999px'   },
  ]

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">

      {/* Colonne gauche */}
      <div className="flex flex-col gap-3">
      {/* Boutons */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-6 space-y-4">
        <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">{t.designForm.sectionButtons}</h3>
        <div>
          <label className="block text-sm text-on-surface mb-2">{t.designForm.buttonRadiusLabel}</label>
          <div className="flex gap-2 flex-wrap">
            {RADIUS_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setData(prev => ({ ...prev, buttonRadius: opt.value }))}
                className={`formal-btn ${data.buttonRadius === opt.value ? 'border-primary text-primary' : ''}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <span className="text-xs text-on-surface-variant">{t.designForm.previewLabel}</span>
            <button
              type="button"
              style={{ borderRadius: data.buttonRadius }}
              className="px-4 py-1.5 bg-primary text-white text-sm font-medium"
            >
              {t.designForm.example}
            </button>
          </div>
        </div>
      </div>

      </div>{/* end left column */}

      {/* Colonne droite */}
      <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-6 space-y-4">
        <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">{t.designForm.sectionHeader}</h3>
        <div>
          <label className="block text-sm text-on-surface mb-1.5">{t.designForm.logoSizeLabel}</label>
          <input
            type="number"
            min={16}
            max={120}
            value={data.headerLogoSize}
            onChange={e => setData(prev => ({ ...prev, headerLogoSize: e.target.value }))}
            className="w-32 bg-surface-container border border-outline-variant/20 rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary/50"
          />
        </div>
      </div>

      {/* Footer */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-6 space-y-4">
        <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">{t.designForm.sectionFooter}</h3>
        <div>
          <label className="block text-sm text-on-surface mb-1.5">{t.designForm.footerTextLabel}</label>
          <input
            type="text"
            value={data.footerText}
            onChange={e => setData(prev => ({ ...prev, footerText: e.target.value }))}
            className="w-full bg-surface-container border border-outline-variant/20 rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary/50"
            placeholder="© 2025 Leksis"
          />
        </div>
        <div>
          <label className="block text-sm text-on-surface mb-1.5">{t.designForm.footerTextColorLabel}</label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={data.footerTextColor || '#8a8fa8'}
              onChange={e => setData(prev => ({ ...prev, footerTextColor: e.target.value }))}
              className="w-10 h-10 rounded-lg border border-outline-variant/20 cursor-pointer bg-transparent p-0.5"
            />
            <input
              type="text"
              value={data.footerTextColor}
              onChange={e => setData(prev => ({ ...prev, footerTextColor: e.target.value }))}
              className="flex-1 bg-surface-container border border-outline-variant/20 rounded-lg px-3 py-2 text-sm text-on-surface font-mono focus:outline-none focus:border-primary/50"
              placeholder="#8a8fa8"
            />
            {data.footerTextColor && (
              <button
                type="button"
                onClick={() => setData(prev => ({ ...prev, footerTextColor: '' }))}
                className="icon-btn text-on-surface-variant"
                title={t.designForm.resetColorTitle}
              >
                <span className="material-symbols-outlined text-base leading-none" aria-hidden="true">restart_alt</span>
              </button>
            )}
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm text-on-surface">{t.designForm.footerLinksLabel}</label>
            <button type="button" onClick={addFooterLink} className="text-button text-xs">
              <span className="material-symbols-outlined text-sm leading-none" aria-hidden="true">add</span>
              {t.designForm.addLink}
            </button>
          </div>
          <div className="space-y-2">
            {data.footerLinks.map((link, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input
                  type="text"
                  value={link.label}
                  onChange={e => updateFooterLink(i, 'label', e.target.value)}
                  placeholder={t.designForm.linkLabelPlaceholder}
                  className="flex-1 bg-surface-container border border-outline-variant/20 rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary/50"
                />
                <input
                  type="text"
                  value={link.url}
                  onChange={e => updateFooterLink(i, 'url', e.target.value)}
                  placeholder="https://..."
                  className="flex-1 bg-surface-container border border-outline-variant/20 rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary/50"
                />
                <button type="button" onClick={() => removeFooterLink(i)} className="icon-btn text-error">
                  <span className="material-symbols-outlined text-base leading-none" aria-hidden="true">delete</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      </div>{/* end right column */}

      </div>{/* end grid */}
      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving} className="action-btn disabled:opacity-40">
          {saving ? (
            <span className="material-symbols-outlined animate-spin text-base leading-none" aria-hidden="true">progress_activity</span>
          ) : (
            <span className="material-symbols-outlined text-base leading-none" aria-hidden="true">save</span>
          )}
          {t.designForm.save}
        </button>
      </div>
    </div>
  )
}

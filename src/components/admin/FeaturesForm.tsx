'use client'

import { useState } from 'react'
import { LANGUAGES } from '@/lib/languages'
import type { ToastState } from './AdminToast'
import { useI18n } from '@/lib/i18n'

interface FeaturesTabs {
  text:     boolean
  document: boolean
  image:    boolean
  rewrite:  boolean
}

interface FeaturesDefaults {
  sourceLang: string
  targetLang: string
}

interface FeaturesLimits {
  maxTextChars:  number
  maxDocChars:   number
  maxImageMB:    number
}

interface FeaturesData {
  tabs:             FeaturesTabs
  defaults:         FeaturesDefaults
  limits:           FeaturesLimits
  showFooterQuotes: boolean
}

const DEFAULT_FEATURES: FeaturesData = {
  tabs:             { text: true, document: true, image: true, rewrite: true },
  defaults:         { sourceLang: 'auto', targetLang: 'en' },
  limits:           { maxTextChars: 5000, maxDocChars: 12000, maxImageMB: 10 },
  showFooterQuotes: true,
}

interface Props {
  initial: Partial<FeaturesData>
  onToast: (t: ToastState) => void
}

export function FeaturesForm({ initial, onToast }: Props) {
  const { t } = useI18n()
  const [data, setData] = useState<FeaturesData>({
    tabs:             { ...DEFAULT_FEATURES.tabs,     ...(initial.tabs     ?? {}) },
    defaults:         { ...DEFAULT_FEATURES.defaults, ...(initial.defaults ?? {}) },
    limits:           { ...DEFAULT_FEATURES.limits,   ...(initial.limits   ?? {}) },
    showFooterQuotes: initial.showFooterQuotes !== false,
  })
  const [saving, setSaving] = useState(false)

  const MODULE_LABELS: { id: keyof FeaturesTabs; label: string; icon: string; desc: string }[] = [
    { id: 'text',     label: t.featuresForm.moduleText,     icon: 'translate',     desc: t.featuresForm.moduleTextDesc     },
    { id: 'document', label: t.featuresForm.moduleDocument, icon: 'description',   desc: t.featuresForm.moduleDocumentDesc },
    { id: 'image',    label: t.featuresForm.moduleImage,    icon: 'image_search',  desc: t.featuresForm.moduleImageDesc    },
    { id: 'rewrite',  label: t.featuresForm.moduleRewrite,  icon: 'auto_fix_high', desc: t.featuresForm.moduleRewriteDesc  },
  ]

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'features', value: data }),
      })
      if (!res.ok) throw new Error()
      onToast({ type: 'success', message: t.featuresForm.toastSaved })
    } catch {
      onToast({ type: 'error', message: t.featuresForm.toastError })
    } finally {
      setSaving(false)
    }
  }

  function setTab(id: keyof FeaturesTabs, value: boolean) {
    setData(prev => ({ ...prev, tabs: { ...prev.tabs, [id]: value } }))
  }

  function setDefault(field: keyof FeaturesDefaults, value: string) {
    setData(prev => ({ ...prev, defaults: { ...prev.defaults, [field]: value } }))
  }

  function setLimit(field: keyof FeaturesLimits, raw: string) {
    const n = parseInt(raw, 10)
    if (!isNaN(n) && n > 0) {
      setData(prev => ({ ...prev, limits: { ...prev.limits, [field]: n } }))
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">

      {/* Section A — Modules actifs */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-6 space-y-4">
        <div>
          <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">{t.featuresForm.sectionModules}</h3>
          <p className="text-xs text-on-surface-variant">{t.featuresForm.modulesDesc}</p>
        </div>
        <div className="space-y-2">
          {MODULE_LABELS.map(m => (
            <label
              key={m.id}
              className="flex items-center justify-between gap-4 bg-surface-container border border-outline-variant/20 rounded-lg px-4 py-3 cursor-pointer hover:bg-surface-container/60 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-on-surface-variant text-base leading-none" aria-hidden="true">{m.icon}</span>
                <div>
                  <span className="text-sm font-medium text-on-surface">{m.label}</span>
                  <span className="text-xs text-on-surface-variant ml-2">{m.desc}</span>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={data.tabs[m.id]}
                onClick={() => setTab(m.id, !data.tabs[m.id])}
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none ${
                  data.tabs[m.id] ? 'bg-primary' : 'bg-outline-variant/40'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                    data.tabs[m.id] ? 'translate-x-4' : 'translate-x-1'
                  }`}
                />
              </button>
            </label>
          ))}
        </div>
      </div>

      {/* Section B + C stacked in right column */}
      <div className="flex flex-col gap-3">
        {/* Section B — Langues par défaut */}
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-6 space-y-4">
          <div>
            <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">{t.featuresForm.sectionDefaults}</h3>
            <p className="text-xs text-on-surface-variant">{t.featuresForm.defaultsDesc}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-on-surface mb-1.5">{t.featuresForm.sourceLangLabel}</label>
              <select
                value={data.defaults.sourceLang}
                onChange={e => setDefault('sourceLang', e.target.value)}
                className="w-full bg-surface-container border border-outline-variant/20 rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary/50"
              >
                <option value="auto">{t.featuresForm.autoDetect}</option>
                {LANGUAGES.map(l => (
                  <option key={l.code} value={l.code}>{l.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-on-surface mb-1.5">{t.featuresForm.targetLangLabel}</label>
              <select
                value={data.defaults.targetLang}
                onChange={e => setDefault('targetLang', e.target.value)}
                className="w-full bg-surface-container border border-outline-variant/20 rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary/50"
              >
                {LANGUAGES.map(l => (
                  <option key={l.code} value={l.code}>{l.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Section C — Limites */}
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-6 space-y-4">
          <div>
            <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">{t.featuresForm.sectionLimits}</h3>
            <p className="text-xs text-on-surface-variant">{t.featuresForm.limitsDesc}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-on-surface mb-1.5">
                {t.featuresForm.textLimitLabel} <span className="text-on-surface-variant font-normal">{t.featuresForm.textLimitUnit}</span>
              </label>
              <input
                type="number"
                min={100}
                value={data.limits.maxTextChars}
                onChange={e => setLimit('maxTextChars', e.target.value)}
                className="w-full bg-surface-container border border-outline-variant/20 rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary/50"
              />
            </div>
            <div>
              <label className="block text-sm text-on-surface mb-1.5">
                {t.featuresForm.docLimitLabel} <span className="text-on-surface-variant font-normal">{t.featuresForm.docLimitUnit}</span>
              </label>
              <input
                type="number"
                min={100}
                value={data.limits.maxDocChars}
                onChange={e => setLimit('maxDocChars', e.target.value)}
                className="w-full bg-surface-container border border-outline-variant/20 rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary/50"
              />
            </div>
            <div>
              <label className="block text-sm text-on-surface mb-1.5">
                {t.featuresForm.imageLimitLabel} <span className="text-on-surface-variant font-normal">{t.featuresForm.imageLimitUnit}</span>
              </label>
              <input
                type="number"
                min={1}
                value={data.limits.maxImageMB}
                onChange={e => setLimit('maxImageMB', e.target.value)}
                className="w-full bg-surface-container border border-outline-variant/20 rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary/50"
              />
            </div>
          </div>
        </div>
      </div>

      </div>{/* end grid */}

      {/* Section Interface */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-6">
        <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-4">{t.featuresForm.sectionInterface}</h3>
        <label className="flex items-center justify-between gap-4 bg-surface-container border border-outline-variant/20 rounded-lg px-4 py-3 cursor-pointer hover:bg-surface-container/60 transition-colors">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-on-surface-variant text-base leading-none" aria-hidden="true">format_quote</span>
            <div>
              <span className="text-sm font-medium text-on-surface">{t.featuresForm.showFooterQuotesLabel}</span>
              <span className="text-xs text-on-surface-variant ml-2">{t.featuresForm.showFooterQuotesDesc}</span>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={data.showFooterQuotes}
            onClick={() => setData(prev => ({ ...prev, showFooterQuotes: !prev.showFooterQuotes }))}
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none ${
              data.showFooterQuotes ? 'bg-primary' : 'bg-outline-variant/40'
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                data.showFooterQuotes ? 'translate-x-4' : 'translate-x-1'
              }`}
            />
          </button>
        </label>
      </div>

      {/* Save */}
      <div className="flex justify-end pt-2">
        <button onClick={handleSave} disabled={saving} className="action-btn disabled:opacity-40">
          {saving ? (
            <span className="material-symbols-outlined animate-spin text-base leading-none" aria-hidden="true">progress_activity</span>
          ) : (
            <span className="material-symbols-outlined text-base leading-none" aria-hidden="true">save</span>
          )}
          {t.featuresForm.save}
        </button>
      </div>
    </div>
  )
}

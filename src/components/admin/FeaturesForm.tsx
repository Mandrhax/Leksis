'use client'

import { useEffect, useState } from 'react'
import { LANGUAGES } from '@/lib/languages'
import type { ToastState } from './AdminToast'
import type { Formality } from '@/types/leksis'
import { useI18n } from '@/lib/i18n'
import { useDirtyTracking } from '@/hooks/useDirtyTracking'
import {
  TEXT_TRANSLATION_BOUNDS, TEXT_TRANSLATION_DEFAULTS, resolveTextTranslationConfig, type TextTranslationConfig,
} from '@/lib/text-translation-config'

interface FeaturesTabs {
  text:     boolean
  document: boolean
  image:    boolean
  rewrite:  boolean
}

interface FeaturesDefaults {
  sourceLang: string
  targetLang: string
  formality:  Formality
}

interface FeaturesLimits {
  maxTextChars:  number
  maxDocChars:   number
  maxImageMB:    number
  rateLimitPerMin: number
}

interface FeaturesData {
  feedback:         boolean
  tabs:             FeaturesTabs
  defaults:         FeaturesDefaults
  limits:           FeaturesLimits
  textTranslation:  TextTranslationConfig
}

const DEFAULT_FEATURES: FeaturesData = {
  feedback:         true,
  tabs:             { text: true, document: true, image: true, rewrite: true },
  defaults:         { sourceLang: 'auto', targetLang: 'en', formality: 'Informal' },
  limits:           { maxTextChars: 5000, maxDocChars: 12000, maxImageMB: 10, rateLimitPerMin: 30 },
  textTranslation:  TEXT_TRANSLATION_DEFAULTS,
}

interface Props {
  initial: Partial<FeaturesData>
  onToast: (t: ToastState) => void
  onDirtyChange?: (dirty: boolean) => void
}

export function FeaturesForm({ initial, onToast, onDirtyChange }: Props) {
  const { t } = useI18n()
  const [data, setData] = useState<FeaturesData>({
    feedback:         initial.feedback ?? DEFAULT_FEATURES.feedback,
    tabs:             { ...DEFAULT_FEATURES.tabs,     ...(initial.tabs     ?? {}) },
    defaults:         { ...DEFAULT_FEATURES.defaults, ...(initial.defaults ?? {}) },
    limits:           { ...DEFAULT_FEATURES.limits,   ...(initial.limits   ?? {}) },
    textTranslation:  resolveTextTranslationConfig(initial.textTranslation),
  })
  const [saving, setSaving] = useState(false)
  const { dirty, markSaved } = useDirtyTracking(data)
  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])

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
      markSaved()
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

  // Pendant la saisie, tout entier ≤ max (taper « 1500 » passe par « 1 ») ; le minimum est appliqué en quittant le champ
  function setTextTranslation(field: keyof typeof TEXT_TRANSLATION_BOUNDS, raw: string) {
    const n = parseInt(raw, 10)
    if (!isNaN(n) && n >= 0 && n <= TEXT_TRANSLATION_BOUNDS[field].max) {
      setData(prev => ({ ...prev, textTranslation: { ...prev.textTranslation, [field]: n } }))
    }
  }

  function clampTextTranslation(field: keyof typeof TEXT_TRANSLATION_BOUNDS) {
    const { min } = TEXT_TRANSLATION_BOUNDS[field]
    setData(prev => prev.textTranslation[field] >= min ? prev
      : { ...prev, textTranslation: { ...prev.textTranslation, [field]: min } })
  }

  function setLimit(field: keyof FeaturesLimits, raw: string) {
    const n = parseInt(raw, 10)
    // 0 = illimité, autorisé seulement pour la limite de débit
    if (!isNaN(n) && (n > 0 || (field === 'rateLimitPerMin' && n === 0))) {
      setData(prev => ({ ...prev, limits: { ...prev.limits, [field]: n } }))
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">

      <div className="flex flex-col gap-3">
      {/* Section A — Modules actifs */}
      <div className="adm-card space-y-4">
        <div>
          <h3 className="adm-eyebrow mb-1">{t.featuresForm.sectionModules}</h3>
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
          {/* Pas un onglet : le bouton « Signaler un problème » du menu du compte (la boîte de réception admin reste accessible) */}
          <label className="flex items-center justify-between gap-4 bg-surface-container border border-outline-variant/20 rounded-lg px-4 py-3 cursor-pointer hover:bg-surface-container/60 transition-colors">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-on-surface-variant text-base leading-none" aria-hidden="true">feedback</span>
              <div>
                <span className="text-sm font-medium text-on-surface">{t.featuresForm.moduleFeedback}</span>
                <span className="text-xs text-on-surface-variant ml-2">{t.featuresForm.moduleFeedbackDesc}</span>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={data.feedback}
              onClick={() => setData(prev => ({ ...prev, feedback: !prev.feedback }))}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none ${
                data.feedback ? 'bg-primary' : 'bg-outline-variant/40'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                  data.feedback ? 'translate-x-4' : 'translate-x-1'
                }`}
              />
            </button>
          </label>
        </div>
      </div>

      {/* Section D — Traduction de texte automatique */}
      <div className="adm-card space-y-4">
        <div>
          <h3 className="adm-eyebrow mb-1">{t.featuresForm.sectionTextTranslation}</h3>
          <p className="text-xs text-on-surface-variant">{t.featuresForm.textTranslationDesc}</p>
        </div>
        <div>
          <label className="adm-label">
            {t.featuresForm.debounceLabel} <span className="text-on-surface-variant font-normal">{t.featuresForm.debounceUnit}</span>
          </label>
          <input
            type="number"
            min={TEXT_TRANSLATION_BOUNDS.debounceMs.min}
            max={TEXT_TRANSLATION_BOUNDS.debounceMs.max}
            step={100}
            value={data.textTranslation.debounceMs}
            onChange={e => setTextTranslation('debounceMs', e.target.value)}
            onBlur={() => clampTextTranslation('debounceMs')}
            className="w-full sm:w-1/2 adm-input"
          />
          <p className="mt-1 text-xs text-on-surface-variant">{t.featuresForm.debounceHint}</p>
        </div>
        <div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="adm-label">
                {t.featuresForm.minCharsLabel} <span className="text-on-surface-variant font-normal">{t.featuresForm.charsUnit}</span>
              </label>
              <input
                type="number"
                min={TEXT_TRANSLATION_BOUNDS.minChars.min}
                max={TEXT_TRANSLATION_BOUNDS.minChars.max}
                value={data.textTranslation.minChars}
                onChange={e => setTextTranslation('minChars', e.target.value)}
                onBlur={() => clampTextTranslation('minChars')}
                className="adm-input"
              />
            </div>
            <div>
              <label className="adm-label">
                {t.featuresForm.autoDetectMinCharsLabel} <span className="text-on-surface-variant font-normal">{t.featuresForm.charsUnit}</span>
              </label>
              <input
                type="number"
                min={TEXT_TRANSLATION_BOUNDS.autoDetectMinChars.min}
                max={TEXT_TRANSLATION_BOUNDS.autoDetectMinChars.max}
                value={data.textTranslation.autoDetectMinChars}
                onChange={e => setTextTranslation('autoDetectMinChars', e.target.value)}
                onBlur={() => clampTextTranslation('autoDetectMinChars')}
                className="adm-input"
              />
            </div>
          </div>
          <p className="mt-1 text-xs text-on-surface-variant">{t.featuresForm.minCharsHint}</p>
        </div>
        <div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="adm-label">
                {t.featuresForm.cacheTtlLabel} <span className="text-on-surface-variant font-normal">{t.featuresForm.cacheTtlUnit}</span>
              </label>
              <input
                type="number"
                min={TEXT_TRANSLATION_BOUNDS.cacheTtlMinutes.min}
                max={TEXT_TRANSLATION_BOUNDS.cacheTtlMinutes.max}
                value={data.textTranslation.cacheTtlMinutes}
                onChange={e => setTextTranslation('cacheTtlMinutes', e.target.value)}
                onBlur={() => clampTextTranslation('cacheTtlMinutes')}
                className="adm-input"
              />
            </div>
            <div>
              <label className="adm-label">
                {t.featuresForm.cacheMaxLabel} <span className="text-on-surface-variant font-normal">{t.featuresForm.cacheMaxUnit}</span>
              </label>
              <input
                type="number"
                min={TEXT_TRANSLATION_BOUNDS.cacheMaxEntries.min}
                max={TEXT_TRANSLATION_BOUNDS.cacheMaxEntries.max}
                step={100}
                value={data.textTranslation.cacheMaxEntries}
                onChange={e => setTextTranslation('cacheMaxEntries', e.target.value)}
                onBlur={() => clampTextTranslation('cacheMaxEntries')}
                className="adm-input"
              />
            </div>
          </div>
          <p className="mt-1 text-xs text-on-surface-variant">{t.featuresForm.cacheHint}</p>
        </div>
        <label className="flex items-center justify-between gap-4 bg-surface-container border border-outline-variant/20 rounded-lg px-4 py-3 cursor-pointer hover:bg-surface-container/60 transition-colors">
          <div>
            <span className="text-sm font-medium text-on-surface">{t.featuresForm.segmentContextLabel}</span>
            <p className="text-xs text-on-surface-variant">{t.featuresForm.segmentContextDesc}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={data.textTranslation.segmentContext}
            onClick={() => setData(prev => ({ ...prev, textTranslation: { ...prev.textTranslation, segmentContext: !prev.textTranslation.segmentContext } }))}
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none ${
              data.textTranslation.segmentContext ? 'bg-primary' : 'bg-outline-variant/40'
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                data.textTranslation.segmentContext ? 'translate-x-4' : 'translate-x-1'
              }`}
            />
          </button>
        </label>
      </div>
      </div>{/* end left column */}

      {/* Section B + C stacked in right column */}
      <div className="flex flex-col gap-3">
        {/* Section B — Langues par défaut */}
        <div className="adm-card space-y-4">
          <div>
            <h3 className="adm-eyebrow mb-1">{t.featuresForm.sectionDefaults}</h3>
            <p className="text-xs text-on-surface-variant">{t.featuresForm.defaultsDesc}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="adm-label">{t.featuresForm.sourceLangLabel}</label>
              <select
                value={data.defaults.sourceLang}
                onChange={e => setDefault('sourceLang', e.target.value)}
                className="adm-input"
              >
                <option value="auto">{t.featuresForm.autoDetect}</option>
                {LANGUAGES.map(l => (
                  <option key={l.code} value={l.code}>{l.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="adm-label">{t.featuresForm.targetLangLabel}</label>
              <select
                value={data.defaults.targetLang}
                onChange={e => setDefault('targetLang', e.target.value)}
                className="adm-input"
              >
                {LANGUAGES.map(l => (
                  <option key={l.code} value={l.code}>{l.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="adm-label">{t.featuresForm.formalityLabel}</label>
            <div className="flex gap-2">
              {(['Informal', 'Formal'] as const).map(f => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setDefault('formality', f)}
                  className={`formal-btn ${data.defaults.formality === f ? 'active' : ''}`}
                >
                  {f === 'Informal' ? t.featuresForm.formalityInformal : t.featuresForm.formalityFormal}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Section C — Limites */}
        <div className="adm-card space-y-4">
          <div>
            <h3 className="adm-eyebrow mb-1">{t.featuresForm.sectionLimits}</h3>
            <p className="text-xs text-on-surface-variant">{t.featuresForm.limitsDesc}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="adm-label">
                {t.featuresForm.textLimitLabel} <span className="text-on-surface-variant font-normal">{t.featuresForm.textLimitUnit}</span>
              </label>
              <input
                type="number"
                min={100}
                value={data.limits.maxTextChars}
                onChange={e => setLimit('maxTextChars', e.target.value)}
                className="adm-input"
              />
            </div>
            <div>
              <label className="adm-label">
                {t.featuresForm.docLimitLabel} <span className="text-on-surface-variant font-normal">{t.featuresForm.docLimitUnit}</span>
              </label>
              <input
                type="number"
                min={100}
                value={data.limits.maxDocChars}
                onChange={e => setLimit('maxDocChars', e.target.value)}
                className="adm-input"
              />
            </div>
            <div>
              <label className="adm-label">
                {t.featuresForm.imageLimitLabel} <span className="text-on-surface-variant font-normal">{t.featuresForm.imageLimitUnit}</span>
              </label>
              <input
                type="number"
                min={1}
                value={data.limits.maxImageMB}
                onChange={e => setLimit('maxImageMB', e.target.value)}
                className="adm-input"
              />
            </div>
          </div>
          <div>
            <label className="adm-label">
              {t.featuresForm.rateLimitLabel} <span className="text-on-surface-variant font-normal">{t.featuresForm.rateLimitUnit}</span>
            </label>
            <input
              type="number"
              min={0}
              value={data.limits.rateLimitPerMin}
              onChange={e => setLimit('rateLimitPerMin', e.target.value)}
              className="w-full sm:w-1/3 adm-input"
            />
            <p className="mt-1 text-xs text-on-surface-variant">{t.featuresForm.rateLimitHint}</p>
          </div>
        </div>
      </div>

      </div>{/* end grid */}

      {/* Save */}
      <div className="flex justify-end pt-2">
        <button onClick={handleSave} disabled={saving || !dirty} className="btn btn-primary">
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

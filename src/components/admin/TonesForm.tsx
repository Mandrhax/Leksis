'use client'

import { useState } from 'react'
import type { ToneConfig } from '@/types/leksis'
import type { ToastState } from './AdminToast'
import { useI18n } from '@/lib/i18n'

const MAX_TONES = 6

interface Props {
  initial: ToneConfig[]
  onToast: (t: ToastState) => void
}

type ToneRow = ToneConfig & { isNew?: boolean }

type FieldErrors = Record<number, { labelEn?: string; instruction?: string; duplicateId?: string }>

function slugify(str: string): string {
  return str.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 32) || 'tone'
}

function ensureUniqueId(base: string, existing: ToneRow[], excludeIdx: number): string {
  const taken = existing.filter((_, i) => i !== excludeIdx).map(t => t.id)
  if (!taken.includes(base)) return base
  let i = 2
  while (taken.includes(`${base}-${i}`)) i++
  return `${base}-${i}`
}

const DEFAULT_SEED: ToneRow[] = [
  { id: 'professional',  labels: { en: 'Professional',  fr: 'Professionnel', de: 'Professionell'  }, instruction: 'in a professional, formal tone appropriate for business communication' },
  { id: 'casual',        labels: { en: 'Casual',         fr: 'Décontracté',   de: 'Locker'         }, instruction: 'in a casual, relaxed tone as if talking to a friend' },
  { id: 'friendly',      labels: { en: 'Friendly',       fr: 'Amical',        de: 'Freundlich'     }, instruction: 'in a warm and friendly tone that feels approachable and welcoming' },
  { id: 'authoritative', labels: { en: 'Authoritative',  fr: 'Autoritaire',   de: 'Autoritativ'    }, instruction: 'in an authoritative, confident tone that conveys expertise and credibility' },
  { id: 'empathetic',    labels: { en: 'Empathetic',     fr: 'Empathique',    de: 'Einfühlsam'     }, instruction: 'in an empathetic, compassionate tone that acknowledges feelings and builds connection' },
  { id: 'creative',      labels: { en: 'Creative',       fr: 'Créatif',       de: 'Kreativ'        }, instruction: 'in a creative, expressive tone that uses vivid language and original phrasing' },
]

function migrateRow(tc: ToneConfig): ToneRow {
  const raw = tc as ToneConfig & { label?: string }
  if (raw.label && !tc.labels) {
    return { ...tc, labels: { en: raw.label } }
  }
  return { ...tc }
}

export function TonesForm({ initial, onToast }: Props) {
  const { t } = useI18n()

  const seed: ToneRow[] = initial.length > 0
    ? initial.map(migrateRow)
    : DEFAULT_SEED

  const [tones, setTones]   = useState<ToneRow[]>(seed)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [saving, setSaving] = useState(false)

  function updateLabel(idx: number, lang: 'en' | 'fr' | 'de' | 'it', value: string) {
    setTones(prev => {
      const next = prev.map((tn, i) => i === idx
        ? { ...tn, labels: { ...tn.labels, [lang]: value } }
        : tn
      )
      // Derive ID from EN label for new rows
      if (lang === 'en' && prev[idx].isNew) {
        const slug = ensureUniqueId(slugify(value), next, idx)
        next[idx] = { ...next[idx], id: slug }
      }
      return next
    })
    if (lang === 'en') {
      setErrors(prev => {
        const updated = { ...prev }
        if (updated[idx]) {
          updated[idx] = { ...updated[idx], labelEn: undefined }
          if (!updated[idx].labelEn && !updated[idx].instruction && !updated[idx].duplicateId) delete updated[idx]
        }
        return updated
      })
    }
  }

  function updateInstruction(idx: number, value: string) {
    setTones(prev => prev.map((tn, i) => i === idx ? { ...tn, instruction: value } : tn))
    setErrors(prev => {
      const updated = { ...prev }
      if (updated[idx]) {
        updated[idx] = { ...updated[idx], instruction: undefined }
        if (!updated[idx].labelEn && !updated[idx].instruction && !updated[idx].duplicateId) delete updated[idx]
      }
      return updated
    })
  }

  function toggleEnabled(idx: number) {
    setTones(prev => prev.map((tn, i) => i === idx ? { ...tn, enabled: tn.enabled === false ? true : false } : tn))
  }

  function addTone() {
    if (tones.length >= MAX_TONES) return
    setTones(prev => [...prev, { id: 'new-tone', labels: { en: '', fr: '', de: '' }, instruction: '', enabled: true, isNew: true }])
  }

  function removeTone(idx: number) {
    if (tones.length <= 1) return
    setTones(prev => prev.filter((_, i) => i !== idx))
    setErrors(prev => {
      const next: FieldErrors = {}
      Object.entries(prev).forEach(([k, v]) => {
        const n = parseInt(k)
        if (n < idx) next[n] = v
        else if (n > idx) next[n - 1] = v
      })
      return next
    })
  }

  function moveUp(idx: number) {
    if (idx === 0) return
    setTones(prev => {
      const next = [...prev]
      ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
      return next
    })
  }

  function moveDown(idx: number) {
    setTones(prev => {
      if (idx >= prev.length - 1) return prev
      const next = [...prev]
      ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
      return next
    })
  }

  function validate(): boolean {
    const newErrors: FieldErrors = {}
    const seenIds = new Set<string>()
    let valid = true

    tones.forEach((tone, idx) => {
      const rowErrors: FieldErrors[number] = {}
      if (!tone.labels?.en?.trim()) {
        rowErrors.labelEn = t.tonesForm.errorEmptyLabel
        valid = false
      }
      if (!tone.instruction.trim()) {
        rowErrors.instruction = t.tonesForm.errorEmptyInstruction
        valid = false
      }
      if (tone.id && seenIds.has(tone.id)) {
        rowErrors.duplicateId = t.tonesForm.errorDuplicateId
        valid = false
      }
      if (tone.id) seenIds.add(tone.id)
      if (Object.keys(rowErrors).length > 0) newErrors[idx] = rowErrors
    })

    setErrors(newErrors)
    return valid
  }

  async function handleSave() {
    if (!validate()) return
    setSaving(true)
    try {
      const payload: ToneConfig[] = tones.map(({ isNew: _isNew, ...tc }) => ({
        ...tc,
        labels: {
          en: tc.labels.en,
          ...(tc.labels.fr?.trim() ? { fr: tc.labels.fr.trim() } : {}),
          ...(tc.labels.de?.trim() ? { de: tc.labels.de.trim() } : {}),
        },
      }))
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'rewrite_tones', value: payload }),
      })
      if (!res.ok) throw new Error()
      setTones(prev => prev.map(({ isNew: _isNew, ...tc }) => tc))
      onToast({ type: 'success', message: t.tonesForm.toastSaved })
    } catch {
      onToast({ type: 'error', message: t.tonesForm.toastError })
    } finally {
      setSaving(false)
    }
  }

  const atMax       = tones.length >= MAX_TONES
  const atMin       = tones.length <= 1
  const activeCount = tones.filter(tn => tn.enabled !== false).length

  return (
    <div className="flex flex-col gap-3">
      <section>
        <h2 className="text-sm font-semibold text-on-surface mb-1">{t.tonesForm.sectionTones}</h2>
        <p className="text-xs text-on-surface-variant mb-4">{t.tonesForm.tonesDesc}</p>

        {/* Table header */}
        <div className="hidden sm:grid grid-cols-[auto_1fr_2fr_auto] gap-x-3 px-3 mb-1">
          <span className="w-9" />
          <span className="text-xs font-medium text-on-surface-variant uppercase tracking-wide">{t.tonesForm.colLabel}</span>
          <span className="text-xs font-medium text-on-surface-variant uppercase tracking-wide">{t.tonesForm.colInstruction}</span>
          <span className="w-24" />
        </div>

        {/* Rows */}
        <div className="space-y-2">
          {tones.map((tone, idx) => {
            const isEnabled   = tone.enabled !== false
            const isLastActive = isEnabled && activeCount <= 1
            return (
              <div
                key={tone.id + idx}
                className={`bg-surface-container-lowest border border-outline-variant/20 rounded-lg px-3 py-3 transition-opacity ${isEnabled ? '' : 'opacity-50'}`}
              >
                <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr_2fr_auto] gap-x-3 gap-y-2 items-start">

                  {/* Toggle enabled */}
                  <div className="flex items-start justify-center w-9 pt-2">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isEnabled}
                      title={isLastActive ? t.tonesForm.disableToneDisabled : (isEnabled ? t.tonesForm.disableTone : t.tonesForm.enableTone)}
                      disabled={isLastActive}
                      onClick={() => toggleEnabled(idx)}
                      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none disabled:cursor-not-allowed ${
                        isEnabled ? 'bg-primary' : 'bg-outline-variant/40'
                      }`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${isEnabled ? 'translate-x-4' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  {/* Labels EN / FR / DE + ID */}
                  <div className="space-y-1.5">
                    {/* EN — requis */}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-primary w-6 shrink-0">EN</span>
                        <input
                          type="text"
                          value={tone.labels?.en ?? ''}
                          maxLength={60}
                          placeholder={t.tonesForm.labelPlaceholder}
                          onChange={e => updateLabel(idx, 'en', e.target.value)}
                          className={`flex-1 bg-surface-container border rounded-lg px-3 py-1.5 text-sm text-on-surface focus:outline-none focus:border-primary/50 ${
                            errors[idx]?.labelEn || errors[idx]?.duplicateId ? 'border-error/60' : 'border-outline-variant/20'
                          }`}
                        />
                      </div>
                      {errors[idx]?.labelEn && <p className="text-xs text-error mt-0.5 ml-8">{errors[idx].labelEn}</p>}
                      {errors[idx]?.duplicateId && <p className="text-xs text-error mt-0.5 ml-8">{errors[idx].duplicateId}</p>}
                    </div>

                    {/* FR — optionnel */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-on-surface-variant w-6 shrink-0">FR</span>
                      <input
                        type="text"
                        value={tone.labels?.fr ?? ''}
                        maxLength={60}
                        placeholder={t.tonesForm.labelFallbackHint}
                        onChange={e => updateLabel(idx, 'fr', e.target.value)}
                        className="flex-1 bg-surface-container border border-outline-variant/20 rounded-lg px-3 py-1.5 text-sm text-on-surface focus:outline-none focus:border-primary/50"
                      />
                    </div>

                    {/* DE — optionnel */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-on-surface-variant w-6 shrink-0">DE</span>
                      <input
                        type="text"
                        value={tone.labels?.de ?? ''}
                        maxLength={60}
                        placeholder={t.tonesForm.labelFallbackHint}
                        onChange={e => updateLabel(idx, 'de', e.target.value)}
                        className="flex-1 bg-surface-container border border-outline-variant/20 rounded-lg px-3 py-1.5 text-sm text-on-surface focus:outline-none focus:border-primary/50"
                      />
                    </div>

                    {/* IT — optionnel */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-on-surface-variant w-6 shrink-0">IT</span>
                      <input
                        type="text"
                        value={tone.labels?.it ?? ''}
                        maxLength={60}
                        placeholder={t.tonesForm.labelFallbackHint}
                        onChange={e => updateLabel(idx, 'it', e.target.value)}
                        className="flex-1 bg-surface-container border border-outline-variant/20 rounded-lg px-3 py-1.5 text-sm text-on-surface focus:outline-none focus:border-primary/50"
                      />
                    </div>

                    {/* ID badge */}
                    <div className="ml-8">
                      <span className="text-xs font-mono text-on-surface-variant/60">
                        id: {tone.id || '—'}
                      </span>
                    </div>
                  </div>

                  {/* Instruction */}
                  <div>
                    <textarea
                      value={tone.instruction}
                      maxLength={300}
                      rows={3}
                      placeholder={t.tonesForm.instructionPlaceholder}
                      onChange={e => updateInstruction(idx, e.target.value)}
                      className={`w-full bg-surface-container border rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary/50 resize-none ${
                        errors[idx]?.instruction ? 'border-error/60' : 'border-outline-variant/20'
                      }`}
                    />
                    {errors[idx]?.instruction && (
                      <p className="text-xs text-error mt-1">{errors[idx].instruction}</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 w-24 justify-end pt-1">
                    <button
                      type="button"
                      title={t.tonesForm.moveUp}
                      disabled={idx === 0}
                      onClick={() => moveUp(idx)}
                      className="p-1.5 rounded text-on-surface-variant hover:text-on-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <span className="material-symbols-outlined text-base leading-none" aria-hidden="true">arrow_upward</span>
                    </button>
                    <button
                      type="button"
                      title={t.tonesForm.moveDown}
                      disabled={idx === tones.length - 1}
                      onClick={() => moveDown(idx)}
                      className="p-1.5 rounded text-on-surface-variant hover:text-on-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <span className="material-symbols-outlined text-base leading-none" aria-hidden="true">arrow_downward</span>
                    </button>
                    <button
                      type="button"
                      title={atMin ? t.tonesForm.deleteToneDisabled : t.tonesForm.deleteTone}
                      disabled={atMin}
                      onClick={() => removeTone(idx)}
                      className="p-1.5 rounded text-on-surface-variant hover:text-error disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <span className="material-symbols-outlined text-base leading-none" aria-hidden="true">close</span>
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Add tone button */}
        <div className="mt-3">
          <button
            type="button"
            disabled={atMax}
            title={atMax ? t.tonesForm.addToneDisabled : undefined}
            onClick={addTone}
            className="flex items-center gap-2 text-sm text-on-surface-variant hover:text-on-surface disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <span className="material-symbols-outlined text-base leading-none" aria-hidden="true">add</span>
            {t.tonesForm.addTone}
            {atMax && <span className="text-xs text-on-surface-variant">({t.tonesForm.addToneDisabled})</span>}
          </button>
        </div>
      </section>

      {/* Save */}
      <div className="flex justify-end pt-2">
        <button onClick={handleSave} disabled={saving} className="action-btn disabled:opacity-40">
          {saving ? (
            <span className="material-symbols-outlined animate-spin text-base leading-none" aria-hidden="true">progress_activity</span>
          ) : (
            <span className="material-symbols-outlined text-base leading-none" aria-hidden="true">save</span>
          )}
          {t.tonesForm.save}
        </button>
      </div>
    </div>
  )
}

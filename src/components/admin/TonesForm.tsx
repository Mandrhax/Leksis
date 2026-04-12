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

type FieldErrors = Record<string, { label?: string; instruction?: string }>

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

export function TonesForm({ initial, onToast }: Props) {
  const { t } = useI18n()

  const seed: ToneRow[] = initial.length > 0
    ? initial.map(tc => ({ ...tc }))
    : [
        { id: 'professional',  label: 'Professional',  instruction: 'in a professional, formal tone appropriate for business communication' },
        { id: 'casual',        label: 'Casual',        instruction: 'in a casual, relaxed tone as if talking to a friend' },
        { id: 'friendly',      label: 'Friendly',      instruction: 'in a warm and friendly tone that feels approachable and welcoming' },
        { id: 'authoritative', label: 'Authoritative', instruction: 'in an authoritative, confident tone that conveys expertise and credibility' },
        { id: 'empathetic',    label: 'Empathetic',    instruction: 'in an empathetic, compassionate tone that acknowledges feelings and builds connection' },
        { id: 'creative',      label: 'Creative',      instruction: 'in a creative, expressive tone that uses vivid language and original phrasing' },
      ]

  const [tones, setTones]   = useState<ToneRow[]>(seed)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [saving, setSaving] = useState(false)

  function updateTone(idx: number, field: keyof ToneConfig, value: string) {
    setTones(prev => {
      const next = prev.map((t, i) => i === idx ? { ...t, [field]: value } : t)
      // Derive ID from label for new rows
      if (field === 'label' && prev[idx].isNew) {
        const slug = ensureUniqueId(slugify(value), next, idx)
        next[idx] = { ...next[idx], id: slug }
      }
      return next
    })
    // Clear error on change
    setErrors(prev => {
      const updated = { ...prev }
      if (updated[idx]) {
        updated[idx] = { ...updated[idx], [field]: undefined }
        if (!updated[idx].label && !updated[idx].instruction) delete updated[idx]
      }
      return updated
    })
  }

  function toggleEnabled(idx: number) {
    setTones(prev => prev.map((t, i) => i === idx ? { ...t, enabled: t.enabled === false ? true : false } : t))
  }

  function addTone() {
    if (tones.length >= MAX_TONES) return
    setTones(prev => [...prev, { id: 'new-tone', label: '', instruction: '', enabled: true, isNew: true }])
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
      const rowErrors: { label?: string; instruction?: string } = {}
      if (!tone.label.trim()) {
        rowErrors.label = t.tonesForm.errorEmptyLabel
        valid = false
      }
      if (!tone.instruction.trim()) {
        rowErrors.instruction = t.tonesForm.errorEmptyInstruction
        valid = false
      }
      if (tone.id && seenIds.has(tone.id)) {
        rowErrors.label = t.tonesForm.errorDuplicateId
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
      const payload: ToneConfig[] = tones.map(({ isNew: _isNew, ...tc }) => tc)
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'rewrite_tones', value: payload }),
      })
      if (!res.ok) throw new Error()
      // Mark all rows as non-new after save
      setTones(prev => prev.map(({ isNew: _isNew, ...tc }) => tc))
      onToast({ type: 'success', message: t.tonesForm.toastSaved })
    } catch {
      onToast({ type: 'error', message: t.tonesForm.toastError })
    } finally {
      setSaving(false)
    }
  }

  const atMax        = tones.length >= MAX_TONES
  const atMin        = tones.length <= 1
  const activeCount  = tones.filter(t => t.enabled !== false).length

  return (
    <div className="space-y-6 max-w-4xl">
      <section>
        <h2 className="text-sm font-semibold text-on-surface mb-1">{t.tonesForm.sectionTones}</h2>
        <p className="text-xs text-on-surface-variant mb-4">{t.tonesForm.tonesDesc}</p>

        {/* Table header */}
        <div className="hidden sm:grid grid-cols-[auto_1fr_auto_2fr_auto] gap-x-3 px-3 mb-1">
          <span className="w-9" />
          <span className="text-xs font-medium text-on-surface-variant uppercase tracking-wide">{t.tonesForm.colLabel}</span>
          <span className="text-xs font-medium text-on-surface-variant uppercase tracking-wide w-28">{t.tonesForm.colId}</span>
          <span className="text-xs font-medium text-on-surface-variant uppercase tracking-wide">{t.tonesForm.colInstruction}</span>
          <span className="w-24" />
        </div>

        {/* Rows */}
        <div className="space-y-2">
          {tones.map((tone, idx) => {
            const isEnabled = tone.enabled !== false
            const isLastActive = isEnabled && activeCount <= 1
            return (
            <div
              key={tone.id + idx}
              className={`bg-surface-container-lowest border border-outline-variant/20 rounded-lg px-3 py-3 transition-opacity ${isEnabled ? '' : 'opacity-50'}`}
            >
              {/* Grid row */}
              <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr_auto_2fr_auto] gap-x-3 gap-y-2 items-start">

                {/* Enabled toggle */}
                <div className="flex items-center justify-center w-9 pt-1.5">
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

                {/* Label */}
                <div>
                  <input
                    type="text"
                    value={tone.label}
                    maxLength={60}
                    placeholder={t.tonesForm.labelPlaceholder}
                    onChange={e => updateTone(idx, 'label', e.target.value)}
                    className={`w-full bg-surface-container border rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary/50 ${
                      errors[idx]?.label ? 'border-error/60' : 'border-outline-variant/20'
                    }`}
                  />
                  {errors[idx]?.label && (
                    <p className="text-xs text-error mt-1">{errors[idx].label}</p>
                  )}
                </div>

                {/* ID badge */}
                <div className="w-28 flex items-center">
                  <span className="text-xs font-mono text-on-surface-variant bg-surface-container border border-outline-variant/20 rounded px-2 py-1.5 truncate max-w-full">
                    {tone.id || '—'}
                  </span>
                </div>

                {/* Instruction */}
                <div>
                  <textarea
                    value={tone.instruction}
                    maxLength={300}
                    rows={2}
                    placeholder={t.tonesForm.instructionPlaceholder}
                    onChange={e => updateTone(idx, 'instruction', e.target.value)}
                    className={`w-full bg-surface-container border rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary/50 resize-none ${
                      errors[idx]?.instruction ? 'border-error/60' : 'border-outline-variant/20'
                    }`}
                  />
                  {errors[idx]?.instruction && (
                    <p className="text-xs text-error mt-1">{errors[idx].instruction}</p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 w-24 justify-end">
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

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '@/lib/i18n'
import {
  FEEDBACK_CATEGORIES, FEEDBACK_IMAGE_MAX_BYTES, FEEDBACK_IMAGE_MAX_SIDE, FEEDBACK_MAX_CHARS, FEEDBACK_MAX_IMAGES,
  type FeedbackCategory,
} from '@/lib/feedback-schema'
import { prepareImage as prepareImageFor } from '@/lib/image-prepare'

interface Props {
  open:       boolean
  onClose:    () => void
  /** Onglet actif de l'espace de travail, joint au message si l'utilisateur l'accepte */
  activeTab?: string
  /** Catégorie présélectionnée à l'ouverture (lien « Signaler un problème » sous un résultat) */
  initialCategory?: FeedbackCategory | null
}

interface Attached {
  id:   number
  blob: Blob
  url:  string
}

const MAX_MB = FEEDBACK_IMAGE_MAX_BYTES / (1024 * 1024)

// Orientation EXIF appliquée, métadonnées (GPS…) retirées, taille réduite : voir lib/image-prepare.ts
const prepareImage = (file: Blob) => prepareImageFor(file, { maxSide: FEEDBACK_IMAGE_MAX_SIDE, maxBytes: FEEDBACK_IMAGE_MAX_BYTES })

export function FeedbackModal({ open, onClose, activeTab, initialCategory }: Props) {
  const { t, locale } = useI18n()
  const f = t.feedback

  const [category, setCategory]   = useState<FeedbackCategory>('problem')
  const [message, setMessage]     = useState('')
  const [images, setImages]       = useState<Attached[]>([])
  const [withContext, setWithContext] = useState(true)
  const [sending, setSending]     = useState(false)
  const [sent, setSent]           = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [dragOver, setDragOver]   = useState(false)
  const fileRef  = useRef<HTMLInputElement>(null)
  const nextId   = useRef(0)
  const imagesRef = useRef<Attached[]>([])
  useEffect(() => { imagesRef.current = images }, [images])

  const reset = useCallback(() => {
    imagesRef.current.forEach(img => URL.revokeObjectURL(img.url))
    setCategory('problem'); setMessage(''); setImages([]); setWithContext(true)
    setSending(false); setSent(false); setError(null); setDragOver(false)
  }, [])

  const close = useCallback(() => {
    if (sending) return
    // Un brouillon non envoyé est gardé tant que la page reste ouverte ; un message envoyé repart de zéro
    if (sent) reset()
    onClose()
  }, [sending, sent, reset, onClose])

  // Ouvert depuis un résultat : la catégorie suit le lien (le reste du brouillon est conservé)
  useEffect(() => {
    if (open && initialCategory) setCategory(initialCategory)
  }, [open, initialCategory])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, close])

  // Libère les aperçus en quittant la page
  useEffect(() => () => imagesRef.current.forEach(img => URL.revokeObjectURL(img.url)), [])

  async function addFiles(files: Blob[]) {
    const candidates = files.filter(file => file.type.startsWith('image/'))
    if (files.length && !candidates.length) { setError(f.errorFormat); return }
    setError(null)
    const room = FEEDBACK_MAX_IMAGES - imagesRef.current.length
    if (candidates.length > room) setError(f.errorTooMany.replace('{0}', String(FEEDBACK_MAX_IMAGES)))
    const added: Attached[] = []
    for (const file of candidates.slice(0, Math.max(0, room))) {
      const out = await prepareImage(file)
      if (out === 'format') { setError(f.errorFormat); continue }
      if (out === 'too_large') { setError(f.errorTooLarge.replace('{0}', String(MAX_MB))); continue }
      added.push({ id: nextId.current++, blob: out, url: URL.createObjectURL(out) })
    }
    if (added.length) setImages(prev => [...prev, ...added].slice(0, FEEDBACK_MAX_IMAGES))
  }

  function removeImage(id: number) {
    setImages(prev => {
      const img = prev.find(i => i.id === id)
      if (img) URL.revokeObjectURL(img.url)
      return prev.filter(i => i.id !== id)
    })
  }

  function onPaste(e: React.ClipboardEvent) {
    const files = [...e.clipboardData.files].filter(file => file.type.startsWith('image/'))
    if (!files.length) return // texte collé : comportement normal du champ
    e.preventDefault()
    void addFiles(files)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    void addFiles([...e.dataTransfer.files])
  }

  async function submit() {
    if (!message.trim() || sending) return
    setSending(true)
    setError(null)
    const form = new FormData()
    form.append('category', category)
    form.append('message', message.trim())
    form.append('includeContext', String(withContext))
    if (withContext) {
      if (activeTab) form.append('tab', activeTab)
      form.append('uiLocale', locale)
    }
    images.forEach((img, i) => form.append('images', img.blob, `image-${i + 1}.${img.blob.type === 'image/png' ? 'png' : 'jpg'}`))
    try {
      const res = await fetch('/api/feedback', { method: 'POST', body: form })
      if (res.ok) { setSent(true); return }
      const data = await res.json().catch(() => ({})) as { code?: string }
      setError(
        res.status === 429 || data.code === 'rate_limited' ? f.errorRateLimited
        : data.code === 'too_large' ? f.errorTooLarge.replace('{0}', String(MAX_MB))
        : data.code === 'unsupported_format' ? f.errorFormat
        : data.code === 'too_many_images' ? f.errorTooMany.replace('{0}', String(FEEDBACK_MAX_IMAGES))
        : data.code === 'disabled' ? f.errorDisabled
        : f.errorGeneric,
      )
    } catch {
      setError(f.errorGeneric)
    } finally {
      setSending(false)
    }
  }

  if (!open) return null

  const CATEGORY_LABELS: Record<FeedbackCategory, { label: string; icon: string; placeholder: string }> = {
    problem:     { label: f.catProblem,     icon: 'bug_report', placeholder: f.placeholderProblem },
    improvement: { label: f.catImprovement, icon: 'lightbulb',  placeholder: f.placeholderImprovement },
    translation: { label: f.catTranslation, icon: 'translate',  placeholder: f.placeholderTranslation },
    other:       { label: f.catOther,       icon: 'chat',       placeholder: f.placeholderOther },
  }

  return createPortal(
    <>
      <div className="fixed inset-0 bg-black/40 z-[200]" onClick={close} aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={f.title}
        onPaste={sent ? undefined : onPaste}
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[201]
                   w-[calc(100%-2rem)] max-w-xl max-h-[90vh] flex flex-col
                   bg-surface-container-lowest rounded-2xl shadow-xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/15 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="material-symbols-outlined text-primary text-xl" aria-hidden="true">feedback</span>
            <span className="font-semibold text-on-surface truncate">{f.title}</span>
          </div>
          <button type="button" onClick={close} className="icon-btn" aria-label={f.close} disabled={sending}>
            <span className="material-symbols-outlined" aria-hidden="true">close</span>
          </button>
        </div>

        {sent ? (
          <div className="flex flex-col items-center text-center gap-4 px-6 py-12">
            <span className="material-symbols-outlined text-4xl text-primary" aria-hidden="true">check_circle</span>
            <p className="text-sm text-on-surface max-w-sm">{f.success}</p>
            <button type="button" onClick={close} className="action-btn">{f.close}</button>
          </div>
        ) : (
          <>
            <div className="overflow-y-auto px-6 py-5 flex flex-col gap-5">
              {/* Type */}
              <div>
                <div className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">{f.categoryLabel}</div>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={f.categoryLabel}>
                  {FEEDBACK_CATEGORIES.map(c => (
                    <button
                      key={c}
                      type="button"
                      role="radio"
                      aria-checked={category === c}
                      onClick={() => setCategory(c)}
                      className={`formal-btn inline-flex items-center gap-1.5 ${category === c ? 'active' : ''}`}
                    >
                      <span className="material-symbols-outlined text-base leading-none" aria-hidden="true">{CATEGORY_LABELS[c].icon}</span>
                      {CATEGORY_LABELS[c].label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Message */}
              <div>
                <label htmlFor="feedback-message" className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">
                  {f.messageLabel}
                </label>
                <textarea
                  id="feedback-message"
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  maxLength={FEEDBACK_MAX_CHARS}
                  rows={6}
                  placeholder={CATEGORY_LABELS[category].placeholder}
                  className="w-full resize-y rounded-xl border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-sm text-on-surface
                             placeholder:text-on-surface-variant/60 focus:outline-none focus:border-primary"
                  autoFocus
                />
                <div className="text-right text-[11px] text-on-surface-variant/70 mt-1">{message.length} / {FEEDBACK_MAX_CHARS}</div>
              </div>

              {/* Images */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">{f.imagesLabel}</span>
                  <span className="text-[11px] text-on-surface-variant/70">
                    {f.imagesCount.replace('{0}', String(images.length)).replace('{1}', String(FEEDBACK_MAX_IMAGES))}
                  </span>
                </div>
                <div
                  onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={onDrop}
                  className={`rounded-xl border border-dashed p-3 transition-colors ${
                    dragOver ? 'border-primary bg-primary/5' : 'border-outline-variant/40'
                  }`}
                >
                  {images.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {images.map((img, i) => (
                        <div key={img.id} className="relative w-20 h-20 rounded-lg overflow-hidden border border-outline-variant/30 bg-surface-container">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={img.url} alt={`${f.imagesLabel} ${i + 1}`} className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => removeImage(img.id)}
                            className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center"
                            aria-label={f.removeImage}
                            title={f.removeImage}
                          >
                            <span className="material-symbols-outlined text-[14px] leading-none" aria-hidden="true">close</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-on-surface-variant text-center">
                    {f.imagesHint}{' '}
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      disabled={images.length >= FEEDBACK_MAX_IMAGES}
                      className="font-semibold text-primary hover:underline disabled:opacity-40 disabled:no-underline"
                    >
                      {f.addImage}
                    </button>
                  </p>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={e => { void addFiles([...(e.target.files ?? [])]); e.target.value = '' }}
                  />
                </div>
              </div>

              {/* Contexte */}
              <label className="flex items-start gap-2.5 text-sm text-on-surface cursor-pointer">
                <input
                  type="checkbox"
                  checked={withContext}
                  onChange={e => setWithContext(e.target.checked)}
                  className="mt-0.5 accent-[var(--c-primary)]"
                />
                <span className="text-xs text-on-surface-variant">{f.includeContext}</span>
              </label>

              <p className="text-xs text-on-surface-variant/80 flex items-start gap-2">
                <span className="material-symbols-outlined text-base leading-none" aria-hidden="true">lock</span>
                {f.privacyNote}
              </p>

              {error && <p role="alert" className="text-sm text-error">{error}</p>}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-outline-variant/15 shrink-0">
              <button type="button" onClick={close} className="text-button text-sm" disabled={sending}>{f.cancel}</button>
              <button type="button" onClick={submit} className="action-btn" disabled={sending || !message.trim()}>
                <span className="material-symbols-outlined text-base leading-none" aria-hidden="true">
                  {sending ? 'progress_activity' : 'send'}
                </span>
                {sending ? f.sending : f.send}
              </button>
            </div>
          </>
        )}
      </div>
    </>,
    document.body,
  )
}

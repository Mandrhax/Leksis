'use client'

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '@/lib/i18n'
import { AdminToast, type ToastState } from './AdminToast'
import {
  FEEDBACK_CATEGORIES, FEEDBACK_CHANGED_EVENT, FEEDBACK_NOTE_MAX_CHARS, FEEDBACK_STATUSES,
  type FeedbackCategory, type FeedbackContext, type FeedbackStatus,
} from '@/lib/feedback-schema'

type StatusFilter = FeedbackStatus | 'open' | 'all'

interface Row {
  id:               string
  user_email:       string
  category:         FeedbackCategory
  message:          string
  status:           FeedbackStatus
  created_at:       string
  attachment_count: number
}

interface Detail extends Row {
  context:     FeedbackContext | null
  admin_note:  string
  user_exists: boolean
  attachments: { id: string; mime: string; size: number }[]
}

const PAGE_SIZE = 25

const CATEGORY_ICONS: Record<FeedbackCategory, string> = {
  problem: 'bug_report', improvement: 'lightbulb', translation: 'translate', other: 'chat',
}

const STATUS_STYLES: Record<FeedbackStatus, string> = {
  new:         'bg-primary/10 text-primary',
  in_progress: 'bg-[#f39c12]/12 text-[#b9770e]',
  done:        'bg-[#27ae60]/12 text-[#1e8449]',
  archived:    'bg-surface-container text-on-surface-variant',
}

export function FeedbackInbox() {
  const { t, locale } = useI18n()
  const fi = t.feedbackInbox

  const CATEGORY_LABELS: Record<FeedbackCategory, string> = {
    problem: t.feedback.catProblem, improvement: t.feedback.catImprovement,
    translation: t.feedback.catTranslation, other: t.feedback.catOther,
  }
  const STATUS_LABELS: Record<FeedbackStatus, string> = {
    new: fi.filterNew, in_progress: fi.filterInProgress, done: fi.filterDone, archived: fi.filterArchived,
  }
  const TAB_LABELS: Record<string, string> = {
    text: t.home.tabText, document: t.home.tabDocument, image: t.home.tabImage, rewrite: t.home.tabRewrite,
  }

  const [status, setStatus]       = useState<StatusFilter>('open')
  const [category, setCategory]   = useState<FeedbackCategory | ''>('')
  const [page, setPage]           = useState(1)
  const [rows, setRows]           = useState<Row[]>([])
  const [total, setTotal]         = useState(0)
  const [counts, setCounts]       = useState<Record<FeedbackStatus, number>>({ new: 0, in_progress: 0, done: 0, archived: 0 })
  const [loading, setLoading]     = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail]       = useState<Detail | null>(null)
  const [note, setNote]           = useState('')
  const [saving, setSaving]       = useState(false)
  const [lightbox, setLightbox]   = useState<string | null>(null)
  const [toast, setToast]         = useState<ToastState>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const qs = new URLSearchParams({ status, page: String(page) })
      if (category) qs.set('category', category)
      const res = await fetch(`/api/admin/feedback?${qs}`, { cache: 'no-store' })
      if (!res.ok) throw new Error()
      const json = await res.json()
      setRows(json.rows)
      setTotal(json.total)
      setCounts(json.counts)
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [status, category, page])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!selectedId) { setDetail(null); return }
    let cancelled = false
    fetch(`/api/admin/feedback/${selectedId}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then((d: Detail | null) => {
        if (cancelled) return
        setDetail(d)
        setNote(d?.admin_note ?? '')
      })
      .catch(() => { if (!cancelled) setDetail(null) })
    return () => { cancelled = true }
  }, [selectedId])

  useEffect(() => {
    if (!lightbox) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(null) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [lightbox])

  const changed = () => window.dispatchEvent(new Event(FEEDBACK_CHANGED_EVENT))

  async function patch(body: { status?: FeedbackStatus; adminNote?: string }) {
    if (!detail) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/feedback/${detail.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error()
      const json = await res.json() as { status: FeedbackStatus; admin_note: string }
      setDetail(d => (d ? { ...d, status: json.status, admin_note: json.admin_note } : d))
      setNote(json.admin_note)
      setToast({ type: 'success', message: fi.toastUpdated })
      changed()
      await load()
    } catch {
      setToast({ type: 'error', message: fi.toastError })
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!detail || !window.confirm(fi.confirmDelete)) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/feedback/${detail.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setSelectedId(null)
      setToast({ type: 'success', message: fi.toastDeleted })
      changed()
      await load()
    } catch {
      setToast({ type: 'error', message: fi.toastError })
    } finally {
      setSaving(false)
    }
  }

  const fmtDate = (iso: string) => new Date(iso).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' })
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const FILTERS: { id: StatusFilter; label: string; count?: number }[] = [
    { id: 'open', label: fi.filterOpen, count: counts.new + counts.in_progress },
    ...FEEDBACK_STATUSES.map(s => ({ id: s as StatusFilter, label: STATUS_LABELS[s], count: counts[s] })),
    { id: 'all', label: fi.filterAll },
  ]

  return (
    <div className="flex flex-col gap-4">
      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={fi.statusLabel}>
          {FILTERS.map(f => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={status === f.id}
              onClick={() => { setStatus(f.id); setPage(1) }}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                status === f.id ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {f.label}{f.count !== undefined && <span className="ml-1.5 opacity-75">{f.count}</span>}
            </button>
          ))}
        </div>
        <select
          value={category}
          onChange={e => { setCategory(e.target.value as FeedbackCategory | ''); setPage(1) }}
          className="adm-input w-auto ml-auto"
          aria-label={t.feedback.categoryLabel}
        >
          <option value="">{fi.allCategories}</option>
          {FEEDBACK_CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4 items-start">
        {/* Liste */}
        <div className={`flex flex-col gap-3 ${selectedId ? 'hidden lg:flex' : ''}`}>
          <div className="adm-card p-0 overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <span className="material-symbols-outlined animate-spin text-2xl text-on-surface-variant/40" aria-hidden="true">progress_activity</span>
              </div>
            ) : loadError ? (
              <p className="py-12 text-center text-sm text-error">{fi.loadError}</p>
            ) : rows.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-on-surface-variant gap-2">
                <span className="material-symbols-outlined text-3xl" aria-hidden="true">inbox</span>
                <p className="text-sm">{fi.empty}</p>
              </div>
            ) : (
              <ul className="divide-y divide-outline-variant/10">
                {rows.map(r => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(r.id)}
                      className={`w-full text-left px-4 py-3 flex gap-3 transition-colors ${
                        selectedId === r.id ? 'bg-primary/8' : 'hover:bg-surface-container/50'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[1.1rem] leading-none text-on-surface-variant mt-0.5" aria-hidden="true">
                        {CATEGORY_ICONS[r.category]}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center gap-2">
                          <span className={`text-xs truncate ${r.status === 'new' ? 'font-bold text-on-surface' : 'text-on-surface-variant'}`}>{r.user_email}</span>
                          <span className="ml-auto text-[11px] text-on-surface-variant/70 whitespace-nowrap">{fmtDate(r.created_at)}</span>
                        </span>
                        <span className={`block text-sm truncate mt-0.5 ${r.status === 'new' ? 'font-semibold text-on-surface' : 'text-on-surface'}`}>{r.message}</span>
                        <span className="flex items-center gap-2 mt-1">
                          <span className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[r.status]}`}>{STATUS_LABELS[r.status]}</span>
                          <span className="text-[11px] text-on-surface-variant">{CATEGORY_LABELS[r.category]}</span>
                          {r.attachment_count > 0 && (
                            <span className="text-[11px] text-on-surface-variant flex items-center gap-0.5" title={fi.imageCount.replace('{0}', String(r.attachment_count))}>
                              <span className="material-symbols-outlined text-[0.9rem] leading-none" aria-hidden="true">image</span>
                              {r.attachment_count}
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {total > 0 && (
            <div className="flex items-center justify-between text-sm">
              <p className="text-xs text-on-surface-variant">{fi.total.replace('{0}', String(total))}</p>
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <button onClick={() => setPage(p => p - 1)} disabled={page <= 1 || loading} className="icon-btn disabled:opacity-40" aria-label={fi.prevPage}>
                    <span className="material-symbols-outlined text-base leading-none" aria-hidden="true">chevron_left</span>
                  </button>
                  <span className="text-xs text-on-surface-variant">{page} / {totalPages}</span>
                  <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages || loading} className="icon-btn disabled:opacity-40" aria-label={fi.nextPage}>
                    <span className="material-symbols-outlined text-base leading-none" aria-hidden="true">chevron_right</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Détail */}
        <div className={`${selectedId ? '' : 'hidden lg:block'} lg:sticky lg:top-6`}>
          {!selectedId ? (
            <div className="adm-card flex flex-col items-center justify-center py-16 text-on-surface-variant gap-2">
              <span className="material-symbols-outlined text-3xl" aria-hidden="true">mark_email_read</span>
              <p className="text-sm">{fi.selectPrompt}</p>
            </div>
          ) : !detail ? (
            <div className="adm-card flex items-center justify-center py-16">
              <span className="material-symbols-outlined animate-spin text-2xl text-on-surface-variant/40" aria-hidden="true">progress_activity</span>
            </div>
          ) : (
            <div className="adm-card flex flex-col gap-5">
              <button type="button" onClick={() => setSelectedId(null)} className="lg:hidden self-start text-xs font-semibold text-primary flex items-center gap-1">
                <span className="material-symbols-outlined text-base leading-none" aria-hidden="true">arrow_back</span>
                {fi.back}
              </button>

              {/* En-tête */}
              <div className="flex flex-wrap items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-primary/8 flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-[1.1rem] leading-none text-primary" aria-hidden="true">{CATEGORY_ICONS[detail.category]}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-headline font-bold text-sm text-on-surface">{CATEGORY_LABELS[detail.category]}</div>
                  <div className="text-xs text-on-surface-variant mt-0.5 [overflow-wrap:anywhere]">
                    {fi.from} <span className="font-medium text-on-surface">{detail.user_email}</span>
                    {!detail.user_exists && <span className="italic"> ({fi.accountDeleted})</span>}
                    {' · '}{fi.received} {fmtDate(detail.created_at)}
                  </div>
                </div>
                <label className="flex items-center gap-2">
                  <span className="sr-only">{fi.statusLabel}</span>
                  <select
                    value={detail.status}
                    onChange={e => patch({ status: e.target.value as FeedbackStatus })}
                    disabled={saving}
                    className="adm-input w-auto"
                    aria-label={fi.statusLabel}
                  >
                    {FEEDBACK_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                  </select>
                </label>
              </div>

              {/* Message : texte brut, jamais interprété comme du HTML */}
              <p className="text-sm text-on-surface whitespace-pre-wrap [overflow-wrap:anywhere] bg-surface-container-low rounded-lg px-4 py-3">
                {detail.message}
              </p>

              {detail.attachments.length > 0 && (
                <div>
                  <h3 className="adm-eyebrow mb-2">{fi.imagesTitle}</h3>
                  <div className="flex flex-wrap gap-2">
                    {detail.attachments.map((a, i) => {
                      const src = `/api/admin/feedback/attachments/${a.id}`
                      const alt = fi.imageAlt.replace('{0}', String(i + 1))
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => setLightbox(src)}
                          className="w-28 h-28 rounded-lg overflow-hidden border border-outline-variant/30 bg-surface-container hover:opacity-90"
                          title={alt}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={src} alt={alt} className="w-full h-full object-cover" />
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              <div>
                <h3 className="adm-eyebrow mb-2">{fi.contextTitle}</h3>
                {detail.context ? (
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
                    {detail.context.tab && <><dt className="text-on-surface-variant">{fi.ctxTab}</dt><dd className="text-on-surface">{TAB_LABELS[detail.context.tab] ?? detail.context.tab}</dd></>}
                    {detail.context.uiLocale && <><dt className="text-on-surface-variant">{fi.ctxLocale}</dt><dd className="text-on-surface uppercase">{detail.context.uiLocale}</dd></>}
                    {detail.context.appVersion && <><dt className="text-on-surface-variant">{fi.ctxVersion}</dt><dd className="text-on-surface">v{detail.context.appVersion}</dd></>}
                    {detail.context.userAgent && <><dt className="text-on-surface-variant">{fi.ctxBrowser}</dt><dd className="text-on-surface [overflow-wrap:anywhere]">{detail.context.userAgent}</dd></>}
                  </dl>
                ) : (
                  <p className="text-xs text-on-surface-variant">{fi.noContext}</p>
                )}
              </div>

              <div>
                <label htmlFor="feedback-note" className="adm-label">{fi.noteLabel}</label>
                <textarea
                  id="feedback-note"
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  maxLength={FEEDBACK_NOTE_MAX_CHARS}
                  rows={3}
                  placeholder={fi.notePlaceholder}
                  className="adm-input resize-y"
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <button type="button" onClick={remove} disabled={saving} className="btn btn-danger">
                  <span className="material-symbols-outlined text-[0.95rem] leading-none" aria-hidden="true">delete</span>
                  {fi.delete}
                </button>
                <button type="button" onClick={() => patch({ adminNote: note })} disabled={saving || note === detail.admin_note} className="btn btn-primary">
                  {fi.saveNote}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {lightbox && createPortal(
        <div className="fixed inset-0 z-[300] bg-black/80 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="" className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" />
          <button type="button" className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/15 text-white flex items-center justify-center" aria-label={t.feedback.close}>
            <span className="material-symbols-outlined" aria-hidden="true">close</span>
          </button>
        </div>,
        document.body,
      )}

      <AdminToast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  )
}

'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useI18n } from '@/lib/i18n'
import type { Glossary, GlossaryEntry } from '@/types/leksis'
import { AdminToast, type ToastState } from '@/components/admin/AdminToast'
import { LANGUAGES } from '@/lib/languages'
import { buildGlossaryCsv, type CsvIssue, type CsvRejectReason } from '@/lib/glossary-csv'

// ---------------------------------------------------------------------------
// CSV export helper
// ---------------------------------------------------------------------------
function exportEntriesToCSV(entries: GlossaryEntry[], glossaryName: string) {
  const blob = new Blob([buildGlossaryCsv(entries)], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${glossaryName.replace(/\s+/g, '_')}_glossary.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ---------------------------------------------------------------------------
// Language selector helper — "Any" + alphabetical list
// ---------------------------------------------------------------------------
function LangSelect({
  value,
  onChange,
  label,
}: {
  value: string
  onChange: (v: string) => void
  label: string
}) {
  const { t } = useI18n()
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className="adm-input"
    >
      <option value="">{t.glossaryAdmin.anyLang}</option>
      {LANGUAGES.map((l) => (
        <option key={l.code} value={l.code}>
          {l.name}
        </option>
      ))}
    </select>
  )
}

// ---------------------------------------------------------------------------
// Entry row (read + inline edit)
// ---------------------------------------------------------------------------
type EntryDraft = { source: string; target: string; sourceLang: string; targetLang: string; matchVariants: boolean }

function EntryRow({
  entry,
  onDelete,
  onSave,
}: {
  entry: GlossaryEntry
  onDelete: (id: number) => void
  /** Returns true when the change was saved (the row then leaves edit mode). */
  onSave: (id: number, draft: EntryDraft) => Promise<boolean>
}) {
  const { t } = useI18n()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<EntryDraft>({
    source: entry.source, target: entry.target,
    sourceLang: entry.sourceLang ?? '', targetLang: entry.targetLang ?? '',
    matchVariants: entry.matchVariants === true,
  })

  const langName = (code: string | null) => {
    if (!code) return '—'
    return LANGUAGES.find((l) => l.code === code)?.name ?? code
  }

  const startEdit = () => {
    setDraft({
      source: entry.source, target: entry.target,
      sourceLang: entry.sourceLang ?? '', targetLang: entry.targetLang ?? '',
      matchVariants: entry.matchVariants === true,
    })
    setEditing(true)
  }

  const save = async () => {
    if (!draft.source.trim() || !draft.target.trim()) return
    setSaving(true)
    try {
      if (await onSave(entry.id, draft)) setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <tr className="border-b border-outline-variant/10 bg-surface-container/30 align-top">
        <td className="py-2.5 px-4">
          <input
            type="text"
            value={draft.source}
            onChange={(e) => setDraft({ ...draft, source: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
            aria-label={t.glossaryAdmin.sourceTerm}
            className="adm-input"
            autoFocus
          />
          <label className="mt-2 flex items-center gap-2 text-xs text-on-surface-variant cursor-pointer">
            <input
              type="checkbox"
              checked={draft.matchVariants}
              onChange={(e) => setDraft({ ...draft, matchVariants: e.target.checked })}
            />
            {t.glossaryAdmin.matchVariants}
          </label>
        </td>
        <td className="py-2.5 px-4">
          <input
            type="text"
            value={draft.target}
            onChange={(e) => setDraft({ ...draft, target: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
            aria-label={t.glossaryAdmin.targetTerm}
            className="adm-input"
          />
        </td>
        <td className="py-2.5 px-4">
          <LangSelect value={draft.sourceLang} onChange={(v) => setDraft({ ...draft, sourceLang: v })} label={t.glossaryAdmin.sourceLang} />
        </td>
        <td className="py-2.5 px-4">
          <LangSelect value={draft.targetLang} onChange={(v) => setDraft({ ...draft, targetLang: v })} label={t.glossaryAdmin.targetLang} />
        </td>
        <td className="py-2.5 px-4">
          <div className="flex justify-end gap-2">
            <button onClick={save} disabled={saving || !draft.source.trim() || !draft.target.trim()} className="btn btn-primary btn-sm">
              {t.glossaryAdmin.saveEntry}
            </button>
            <button onClick={() => setEditing(false)} disabled={saving} className="btn btn-secondary btn-sm">
              {t.glossaryAdmin.cancel}
            </button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr className="border-b border-outline-variant/10 hover:bg-surface-container/30 transition-colors group">
      <td className="py-2.5 px-4 text-sm text-on-surface">
        {entry.source}
        {entry.matchVariants && (
          <span
            className="ml-2 align-middle text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-primary/10 text-primary"
            title={t.glossaryAdmin.matchVariantsHint}
          >
            {t.glossaryAdmin.variantsBadge}
          </span>
        )}
      </td>
      <td className="py-2.5 px-4 text-sm text-on-surface">{entry.target}</td>
      <td className="py-2.5 px-4 text-sm text-on-surface-variant">{langName(entry.sourceLang)}</td>
      <td className="py-2.5 px-4 text-sm text-on-surface-variant">{langName(entry.targetLang)}</td>
      <td className="py-2.5 px-4 text-right whitespace-nowrap">
        <button
          onClick={startEdit}
          className="icon-btn opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
          aria-label={t.glossaryAdmin.edit}
          title={t.glossaryAdmin.edit}
        >
          <span className="material-symbols-outlined text-base leading-none">edit</span>
        </button>
        <button
          onClick={() => onDelete(entry.id)}
          className="icon-btn opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
          aria-label={t.glossaryAdmin.deleteEntry}
          title={t.glossaryAdmin.deleteEntry}
        >
          <span className="material-symbols-outlined text-base leading-none text-error">delete</span>
        </button>
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------------------
// Glossary detail panel (entries)
// ---------------------------------------------------------------------------
const PAGE_SIZE = 50

function GlossaryEntries({
  glossary,
  onEntryAdded,
  onEntryDeleted,
  onImported,
  showToast,
}: {
  glossary: Glossary
  onEntryAdded: () => void
  onEntryDeleted: () => void
  onImported: () => void
  showToast: (msg: string, type: 'success' | 'error') => void
}) {
  const { t } = useI18n()
  const [entries, setEntries] = useState<GlossaryEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [addSource, setAddSource] = useState('')
  const [addTarget, setAddTarget] = useState('')
  const [addSrcLang, setAddSrcLang] = useState('')
  const [addTgtLang, setAddTgtLang] = useState('')
  const [addVariants, setAddVariants] = useState(false)
  const [saving, setSaving] = useState(false)
  const [importReport, setImportReport] = useState<{ issues: CsvIssue[]; rejectedCount: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // La recherche part 300 ms après la dernière frappe, et revient toujours à la première page
  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedSearch(search.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(id)
  }, [search])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) })
      if (debouncedSearch) params.set('q', debouncedSearch)
      const res = await fetch(`/api/admin/glossary/${glossary.id}/entries?${params}`)
      if (res.ok) {
        const data: { entries: GlossaryEntry[]; total: number } = await res.json()
        // Dernière page vidée (suppression) : on remonte d'une page
        if (data.entries.length === 0 && data.total > 0 && page > 1) {
          setPage(Math.max(1, Math.ceil(data.total / PAGE_SIZE)))
          return
        }
        setEntries(data.entries)
        setTotal(data.total)
      }
    } finally {
      setLoading(false)
    }
  }, [glossary.id, page, debouncedSearch])

  useEffect(() => { load() }, [load])

  // Message d'erreur d'une réponse d'ajout ou de modification
  const failureMessage = async (res: Response, fallback: string): Promise<string> => {
    if (res.status === 409) {
      const data = await res.json().catch(() => ({})) as { code?: string; existingTarget?: string }
      if (data.code === 'duplicate') return t.glossaryAdmin.errorDuplicate.replace('{0}', data.existingTarget ?? '')
    }
    return fallback
  }

  const addEntry = async () => {
    if (!addSource.trim() || !addTarget.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/glossary/${glossary.id}/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: addSource.trim(),
          target: addTarget.trim(),
          sourceLang: addSrcLang || null,
          targetLang: addTgtLang || null,
          matchVariants: addVariants,
        }),
      })
      if (res.ok) {
        setAddSource('')
        setAddTarget('')
        setAddSrcLang('')
        setAddTgtLang('')
        setAddVariants(false)
        await load()
        onEntryAdded()
      } else {
        showToast(await failureMessage(res, t.glossaryAdmin.errorAdd), 'error')
      }
    } finally {
      setSaving(false)
    }
  }

  const saveEntry = async (entryId: number, draft: EntryDraft): Promise<boolean> => {
    const res = await fetch(`/api/admin/glossary/${glossary.id}/entries/${entryId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: draft.source.trim(),
        target: draft.target.trim(),
        sourceLang: draft.sourceLang || null,
        targetLang: draft.targetLang || null,
        matchVariants: draft.matchVariants,
      }),
    })
    if (res.ok) {
      const updated: GlossaryEntry = await res.json()
      setEntries((prev) => prev.map((e) => (e.id === entryId ? updated : e)))
      showToast(t.glossaryAdmin.entryUpdated, 'success')
      return true
    }
    showToast(await failureMessage(res, t.glossaryAdmin.errorEdit), 'error')
    return false
  }

  const deleteEntry = async (entryId: number) => {
    const res = await fetch(`/api/admin/glossary/${glossary.id}/entries/${entryId}`, {
      method: 'DELETE',
    })
    if (res.ok) {
      await load()
      onEntryDeleted()
    } else {
      showToast(t.glossaryAdmin.errorDelete, 'error')
    }
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportReport(null)
    try {
      const text = await file.text()
      const res = await fetch(`/api/admin/glossary/${glossary.id}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: text,
      })
      if (res.ok) {
        const r: { imported: number; duplicates: number; rejectedCount: number; rejected: CsvIssue[] } = await res.json()
        const summary = t.glossaryAdmin.importResult
          .replace('{0}', String(r.imported)).replace('{1}', String(r.duplicates)).replace('{2}', String(r.rejectedCount))
        showToast(summary, r.imported > 0 ? 'success' : 'error')
        if (r.rejectedCount > 0) setImportReport({ issues: r.rejected, rejectedCount: r.rejectedCount })
        await load()
        onImported()
      } else {
        const data = await res.json().catch(() => ({})) as { code?: string }
        const known: Record<string, string> = {
          too_large: t.glossaryAdmin.importTooLarge,
          too_many_rows: t.glossaryAdmin.importTooManyRows,
          empty: t.glossaryAdmin.importEmpty,
        }
        showToast(known[data.code ?? ''] ?? t.glossaryAdmin.errorImport, 'error')
      }
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const reasonLabel = (reason: CsvRejectReason): string => ({
    missing_term: t.glossaryAdmin.reasonMissingTerm,
    too_long: t.glossaryAdmin.reasonTooLong,
    invalid_lang: t.glossaryAdmin.reasonInvalidLang,
  })[reason]

  // L'export reprend tous les termes, pas seulement la page affichée
  const handleExport = async () => {
    const res = await fetch(`/api/admin/glossary/${glossary.id}/entries?all=1`)
    if (!res.ok) { showToast(t.glossaryAdmin.errorExport, 'error'); return }
    exportEntriesToCSV(await res.json(), glossary.name)
  }

  const langLabel = (code: string) =>
    code ? (LANGUAGES.find((l) => l.code === code)?.name ?? code) : t.glossaryAdmin.anyLang

  return (
    <div className="mt-4 adm-card p-0 overflow-hidden">
      {/* Search */}
      <div className="p-4 border-b border-outline-variant/20 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-base leading-none text-on-surface-variant" aria-hidden="true">search</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.glossaryAdmin.searchPlaceholder}
            aria-label={t.glossaryAdmin.searchPlaceholder}
            className="adm-input pl-9"
          />
        </div>
        <span className="text-xs text-on-surface-variant tabular-nums">
          {t.glossaryAdmin.entryCount.replace('{0}', String(total))}
        </span>
      </div>

      {/* Entries table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-outline-variant/20 bg-surface-container/40">
              <th className="py-2.5 px-4 text-left adm-eyebrow">{t.glossaryAdmin.sourceTerm}</th>
              <th className="py-2.5 px-4 text-left adm-eyebrow">{t.glossaryAdmin.targetTerm}</th>
              <th className="py-2.5 px-4 text-left adm-eyebrow">{t.glossaryAdmin.sourceLang}</th>
              <th className="py-2.5 px-4 text-left adm-eyebrow">{t.glossaryAdmin.targetLang}</th>
              <th className="py-2.5 px-4 w-24" />
            </tr>
          </thead>
          <tbody>
            {loading && entries.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-sm text-on-surface-variant">
                  <span className="material-symbols-outlined text-base leading-none animate-spin">progress_activity</span>
                </td>
              </tr>
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-sm text-on-surface-variant">
                  {debouncedSearch ? t.glossaryAdmin.noResults : t.glossaryAdmin.noEntries}
                </td>
              </tr>
            ) : (
              entries.map((entry) => (
                <EntryRow key={entry.id} entry={entry} onDelete={deleteEntry} onSave={saveEntry} />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {lastPage > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-outline-variant/20 text-xs text-on-surface-variant">
          <button onClick={() => setPage(page - 1)} disabled={page <= 1 || loading} className="btn btn-secondary btn-sm">
            {t.glossaryAdmin.prev}
          </button>
          <span className="tabular-nums">
            {t.glossaryAdmin.pageOf.replace('{0}', String(page)).replace('{1}', String(lastPage))}
          </span>
          <button onClick={() => setPage(page + 1)} disabled={page >= lastPage || loading} className="btn btn-secondary btn-sm">
            {t.glossaryAdmin.next}
          </button>
        </div>
      )}

      {/* Add entry form */}
      <div className="border-t border-outline-variant/20 p-4 bg-surface-container/20">
        <p className="adm-eyebrow mb-3">{t.glossaryAdmin.addEntry}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2">
          <input
            type="text"
            value={addSource}
            onChange={(e) => setAddSource(e.target.value)}
            placeholder={t.glossaryAdmin.sourceTermPlaceholder}
            onKeyDown={(e) => e.key === 'Enter' && addEntry()}
            className="adm-input"
          />
          <input
            type="text"
            value={addTarget}
            onChange={(e) => setAddTarget(e.target.value)}
            placeholder={t.glossaryAdmin.targetTermPlaceholder}
            onKeyDown={(e) => e.key === 'Enter' && addEntry()}
            className="adm-input"
          />
          <LangSelect value={addSrcLang} onChange={setAddSrcLang} label={t.glossaryAdmin.sourceLang} />
          <LangSelect value={addTgtLang} onChange={setAddTgtLang} label={t.glossaryAdmin.targetLang} />
        </div>
        <p className="adm-hint mb-3 mt-0">
          {t.glossaryAdmin.scopeHint.replace('{0}', langLabel(addSrcLang)).replace('{1}', langLabel(addTgtLang))}
        </p>
        <label className="flex items-start gap-2.5 cursor-pointer mb-3">
          <input
            type="checkbox"
            checked={addVariants}
            onChange={(e) => setAddVariants(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="block text-sm text-on-surface">{t.glossaryAdmin.matchVariants}</span>
            <span className="block text-xs text-on-surface-variant">{t.glossaryAdmin.matchVariantsHint}</span>
          </span>
        </label>
        <div className="flex items-center gap-3">
          <button
            onClick={addEntry}
            disabled={saving || !addSource.trim() || !addTarget.trim()}
            className="btn btn-primary"
          >
            <span className="material-symbols-outlined text-base leading-none">add</span>
            {t.glossaryAdmin.addEntry}
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="btn btn-secondary"
          >
            <span className="material-symbols-outlined text-base leading-none">upload_file</span>
            {t.glossaryAdmin.importCsv}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleImport}
            className="hidden"
            aria-label={t.glossaryAdmin.importCsv}
          />
          {total > 0 && (
            <button onClick={handleExport} className="btn btn-secondary">
              <span className="material-symbols-outlined text-base leading-none">download</span>
              {t.glossaryAdmin.exportCsv}
            </button>
          )}
        </div>
        <p className="mt-2 text-xs text-on-surface-variant">
          {t.glossaryAdmin.csvHint}
        </p>
        {importReport && (
          <div role="status" className="mt-3 rounded-lg border border-error/30 bg-error/5 p-3">
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <p className="text-sm font-medium text-on-surface">{t.glossaryAdmin.importIssuesTitle}</p>
              <button onClick={() => setImportReport(null)} className="btn btn-secondary btn-sm">{t.glossaryAdmin.dismiss}</button>
            </div>
            <ul className="text-xs text-on-surface-variant space-y-0.5">
              {importReport.issues.map((issue) => (
                <li key={issue.line}>
                  {t.glossaryAdmin.importIssue.replace('{0}', String(issue.line)).replace('{1}', reasonLabel(issue.reason))}
                </li>
              ))}
            </ul>
            {importReport.rejectedCount > importReport.issues.length && (
              <p className="mt-1 text-xs text-on-surface-variant">
                {t.glossaryAdmin.importMore.replace('{0}', String(importReport.rejectedCount - importReport.issues.length))}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// New glossary modal
// ---------------------------------------------------------------------------
function NewGlossaryModal({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (g: Glossary) => void
}) {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/admin/glossary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || undefined }),
      })
      if (res.ok) {
        onCreate(await res.json())
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.glossaryAdmin.newGlossary}
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 shadow-xl w-full max-w-md p-6">
        <h3 className="adm-section-title mb-4">
          {t.glossaryAdmin.newGlossary}
        </h3>

        <div className="space-y-3 mb-6">
          <div>
            <label className="adm-label">
              {t.glossaryAdmin.name} *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              autoFocus
              maxLength={100}
              className="adm-input"
            />
          </div>
          <div>
            <label className="adm-label">
              {t.glossaryAdmin.description}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              maxLength={500}
              className="adm-input resize-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          <button onClick={onClose} className="btn btn-secondary">
            {t.glossaryAdmin.cancel}
          </button>
          <button
            onClick={submit}
            disabled={saving || !name.trim()}
            className="btn btn-primary"
          >
            {saving ? (
              <span className="material-symbols-outlined text-base leading-none animate-spin">progress_activity</span>
            ) : (
              t.glossaryAdmin.create
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function GlossaryAdmin() {
  const { t } = useI18n()
  const [glossaries, setGlossaries] = useState<Glossary[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [toast, setToast] = useState<ToastState>(null)

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type })
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/glossary')
      if (res.ok) setGlossaries(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleCreate = (glossary: Glossary) => {
    setGlossaries((prev) => [...prev, glossary])
    setExpandedId(glossary.id)
    setShowModal(false)
    showToast(t.glossaryAdmin.created, 'success')
  }

  const handleDelete = async (id: number) => {
    const res = await fetch(`/api/admin/glossary/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setGlossaries((prev) => prev.filter((g) => g.id !== id))
      if (expandedId === id) setExpandedId(null)
      setConfirmDeleteId(null)
      showToast(t.glossaryAdmin.deleted, 'success')
    } else {
      showToast(t.glossaryAdmin.errorDelete, 'error')
    }
  }

  // Update entry count on the glossary row after add/delete/import
  const updateCount = useCallback((id: number, delta: number) => {
    setGlossaries((prev) =>
      prev.map((g) => g.id === id ? { ...g, entryCount: Math.max(0, g.entryCount + delta) } : g),
    )
  }, [])

  const refreshCount = useCallback(async (id: number) => {
    const res = await fetch('/api/admin/glossary')
    if (res.ok) {
      const all: Glossary[] = await res.json()
      const updated = all.find((g) => g.id === id)
      if (updated) {
        setGlossaries((prev) => prev.map((g) => g.id === id ? { ...g, entryCount: updated.entryCount } : g))
      }
    }
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <span className="material-symbols-outlined text-2xl leading-none animate-spin text-on-surface-variant">
          progress_activity
        </span>
      </div>
    )
  }

  return (
    <>
      {/* Header action */}
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-on-surface-variant">
          {glossaries.length === 0
            ? t.glossaryAdmin.noGlossaries
            : t.glossaryAdmin.count.replace('{0}', String(glossaries.length))}
        </p>
        <button
          onClick={() => setShowModal(true)}
          className="btn btn-primary"
        >
          <span className="material-symbols-outlined text-base leading-none">add</span>
          {t.glossaryAdmin.newGlossary}
        </button>
      </div>

      {/* Glossary list */}
      <div className="space-y-3">
        {glossaries.map((g) => (
          <div
            key={g.id}
            className="bg-surface-container-lowest rounded-xl border border-outline-variant/20"
          >
            {/* Glossary row header */}
            <div className="flex items-center gap-4 p-5">
              {/* Expand toggle */}
              <button
                onClick={() => setExpandedId(expandedId === g.id ? null : g.id)}
                className="icon-btn flex-shrink-0"
                aria-label={expandedId === g.id ? 'Collapse' : 'Expand'}
              >
                <span className="material-symbols-outlined text-lg leading-none text-on-surface-variant transition-transform"
                  style={{ transform: expandedId === g.id ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                  chevron_right
                </span>
              </button>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-base leading-none text-primary">menu_book</span>
                  <h3 className="font-headline text-sm font-semibold text-on-surface truncate">{g.name}</h3>
                </div>
                {g.description && (
                  <p className="text-xs text-on-surface-variant mt-0.5 truncate">{g.description}</p>
                )}
              </div>

              {/* Entry count badge */}
              <span className="text-xs text-on-surface-variant bg-surface-container px-2.5 py-1 rounded-full flex-shrink-0">
                {t.glossaryAdmin.entryCount.replace('{0}', String(g.entryCount))}
              </span>

              {/* Delete */}
              {confirmDeleteId === g.id ? (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs text-on-surface-variant">{t.glossaryAdmin.confirmDelete}</span>
                  <button
                    onClick={() => handleDelete(g.id)}
                    className="text-xs font-medium text-error hover:text-error/80 transition-colors"
                  >
                    {t.glossaryAdmin.yes}
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    className="text-xs font-medium text-on-surface-variant hover:text-on-surface transition-colors"
                  >
                    {t.glossaryAdmin.no}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDeleteId(g.id)}
                  className="icon-btn flex-shrink-0"
                  aria-label={t.glossaryAdmin.deleteGlossary}
                >
                  <span className="material-symbols-outlined text-base leading-none text-on-surface-variant hover:text-error transition-colors">
                    delete
                  </span>
                </button>
              )}
            </div>

            {/* Expanded entries */}
            {expandedId === g.id && (
              <div className="px-5 pb-5">
                <GlossaryEntries
                  glossary={g}
                  onEntryAdded={() => updateCount(g.id, 1)}
                  onEntryDeleted={() => updateCount(g.id, -1)}
                  onImported={() => refreshCount(g.id)}
                  showToast={showToast}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* New glossary modal */}
      {showModal && (
        <NewGlossaryModal onClose={() => setShowModal(false)} onCreate={handleCreate} />
      )}

      <AdminToast toast={toast} onDismiss={() => setToast(null)} />
    </>
  )
}

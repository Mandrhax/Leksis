'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useI18n } from '@/lib/i18n'
import type { Glossary, GlossaryEntry } from '@/types/leksis'
import { AdminToast, type ToastState } from '@/components/admin/AdminToast'
import { LANGUAGES } from '@/lib/languages'

// ---------------------------------------------------------------------------
// CSV export helper
// ---------------------------------------------------------------------------
function exportEntriesToCSV(entries: GlossaryEntry[], glossaryName: string) {
  const escape = (s: string) => `"${s.replace(/"/g, '""')}"`
  const header = 'source,target,source_lang,target_lang'
  const rows = entries.map((e) =>
    [escape(e.source), escape(e.target), e.sourceLang ?? '', e.targetLang ?? ''].join(','),
  )
  const csv = [header, ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
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
      className="w-full text-sm bg-surface-container border border-outline-variant/40 rounded-lg px-3 py-2 text-on-surface focus:outline-none focus:border-primary"
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
// Entry row
// ---------------------------------------------------------------------------
function EntryRow({
  entry,
  onDelete,
}: {
  entry: GlossaryEntry
  onDelete: (id: number) => void
}) {
  const langName = (code: string | null) => {
    if (!code) return '—'
    return LANGUAGES.find((l) => l.code === code)?.name ?? code
  }

  return (
    <tr className="border-b border-outline-variant/10 hover:bg-surface-container/30 transition-colors group">
      <td className="py-2.5 px-4 text-sm text-on-surface">{entry.source}</td>
      <td className="py-2.5 px-4 text-sm text-on-surface">{entry.target}</td>
      <td className="py-2.5 px-4 text-sm text-on-surface-variant">{langName(entry.sourceLang)}</td>
      <td className="py-2.5 px-4 text-sm text-on-surface-variant">{langName(entry.targetLang)}</td>
      <td className="py-2.5 px-4 text-right">
        <button
          onClick={() => onDelete(entry.id)}
          className="icon-btn opacity-0 group-hover:opacity-100 transition-opacity"
          aria-label="Delete entry"
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
  const [loading, setLoading] = useState(true)
  const [addSource, setAddSource] = useState('')
  const [addTarget, setAddTarget] = useState('')
  const [addSrcLang, setAddSrcLang] = useState('')
  const [addTgtLang, setAddTgtLang] = useState('')
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/glossary/${glossary.id}/entries`)
      if (res.ok) setEntries(await res.json())
    } finally {
      setLoading(false)
    }
  }, [glossary.id])

  useEffect(() => { load() }, [load])

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
        }),
      })
      if (res.ok) {
        const entry = await res.json()
        setEntries((prev) => [...prev, entry])
        setAddSource('')
        setAddTarget('')
        setAddSrcLang('')
        setAddTgtLang('')
        onEntryAdded()
      } else {
        showToast(t.glossaryAdmin.errorAdd, 'error')
      }
    } finally {
      setSaving(false)
    }
  }

  const deleteEntry = async (entryId: number) => {
    const res = await fetch(`/api/admin/glossary/${glossary.id}/entries/${entryId}`, {
      method: 'DELETE',
    })
    if (res.ok) {
      setEntries((prev) => prev.filter((e) => e.id !== entryId))
      onEntryDeleted()
    } else {
      showToast(t.glossaryAdmin.errorDelete, 'error')
    }
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    const res = await fetch(`/api/admin/glossary/${glossary.id}/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: text,
    })
    if (res.ok) {
      const { imported } = await res.json()
      showToast(t.glossaryAdmin.importedCount.replace('{0}', String(imported)), 'success')
      await load()
      onImported()
    } else {
      showToast(t.glossaryAdmin.errorImport, 'error')
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="mt-4 bg-surface-container-lowest rounded-xl border border-outline-variant/20 overflow-hidden">
      {/* Entries table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-outline-variant/20 bg-surface-container/40">
              <th className="py-2.5 px-4 text-left text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
                {t.glossaryAdmin.sourceTerm}
              </th>
              <th className="py-2.5 px-4 text-left text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
                {t.glossaryAdmin.targetTerm}
              </th>
              <th className="py-2.5 px-4 text-left text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
                {t.glossaryAdmin.sourceLang}
              </th>
              <th className="py-2.5 px-4 text-left text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
                {t.glossaryAdmin.targetLang}
              </th>
              <th className="py-2.5 px-4 w-12" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-sm text-on-surface-variant">
                  <span className="material-symbols-outlined text-base leading-none animate-spin">progress_activity</span>
                </td>
              </tr>
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-sm text-on-surface-variant">
                  {t.glossaryAdmin.noEntries}
                </td>
              </tr>
            ) : (
              entries.map((entry) => (
                <EntryRow key={entry.id} entry={entry} onDelete={deleteEntry} />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add entry form */}
      <div className="border-t border-outline-variant/20 p-4 bg-surface-container/20">
        <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-3">
          {t.glossaryAdmin.addEntry}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <input
            type="text"
            value={addSource}
            onChange={(e) => setAddSource(e.target.value)}
            placeholder={t.glossaryAdmin.sourceTermPlaceholder}
            onKeyDown={(e) => e.key === 'Enter' && addEntry()}
            className="text-sm bg-surface-container border border-outline-variant/40 rounded-lg px-3 py-2 text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-primary"
          />
          <input
            type="text"
            value={addTarget}
            onChange={(e) => setAddTarget(e.target.value)}
            placeholder={t.glossaryAdmin.targetTermPlaceholder}
            onKeyDown={(e) => e.key === 'Enter' && addEntry()}
            className="text-sm bg-surface-container border border-outline-variant/40 rounded-lg px-3 py-2 text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-primary"
          />
          <LangSelect value={addSrcLang} onChange={setAddSrcLang} label={t.glossaryAdmin.sourceLang} />
          <LangSelect value={addTgtLang} onChange={setAddTgtLang} label={t.glossaryAdmin.targetLang} />
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={addEntry}
            disabled={saving || !addSource.trim() || !addTarget.trim()}
            className="action-btn flex items-center gap-1.5 text-sm disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-base leading-none">add</span>
            {t.glossaryAdmin.addEntry}
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="text-button flex items-center gap-1.5 text-sm"
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
          {entries.length > 0 && (
            <button
              onClick={() => exportEntriesToCSV(entries, glossary.name)}
              className="text-button flex items-center gap-1.5 text-sm"
            >
              <span className="material-symbols-outlined text-base leading-none">download</span>
              {t.glossaryAdmin.exportCsv}
            </button>
          )}
        </div>
        <p className="mt-2 text-xs text-on-surface-variant">
          {t.glossaryAdmin.csvHint}
        </p>
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
        <h2 className="font-headline text-base font-semibold text-on-surface mb-4">
          {t.glossaryAdmin.newGlossary}
        </h2>

        <div className="space-y-3 mb-6">
          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-1">
              {t.glossaryAdmin.name} *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              autoFocus
              maxLength={100}
              className="w-full text-sm bg-surface-container border border-outline-variant/40 rounded-lg px-3 py-2 text-on-surface focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-1">
              {t.glossaryAdmin.description}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              maxLength={500}
              className="w-full text-sm bg-surface-container border border-outline-variant/40 rounded-lg px-3 py-2 text-on-surface focus:outline-none focus:border-primary resize-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          <button onClick={onClose} className="text-button text-sm">
            {t.glossaryAdmin.cancel}
          </button>
          <button
            onClick={submit}
            disabled={saving || !name.trim()}
            className="action-btn text-sm disabled:opacity-50"
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
          className="action-btn flex items-center gap-1.5 text-sm"
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

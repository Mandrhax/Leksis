'use client'

import { useState, useEffect, useRef } from 'react'
import { getGlossary, saveGlossary, parseCSV, exportCSV } from '@/lib/glossary'
import { useI18n } from '@/lib/i18n'
import type { GlossaryEntry } from '@/types/leksis'

type Props = {
  open: boolean
  onClose: () => void
}

export function GlossaryPanel({ open, onClose }: Props) {
  const { t } = useI18n()
  const [terms, setTerms]           = useState<GlossaryEntry[]>([])
  const [addSource, setAddSource]   = useState('')
  const [addTarget, setAddTarget]   = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) setTerms(getGlossary())
  }, [open])

  const save = (next: GlossaryEntry[]) => {
    setTerms(next)
    saveGlossary(next)
  }

  const handleAdd = () => {
    if (!addSource.trim() || !addTarget.trim()) return
    save([...terms, { source: addSource.trim(), target: addTarget.trim() }])
    setAddSource('')
    setAddTarget('')
  }

  const handleRemove = (i: number) => save(terms.filter((_, j) => j !== i))

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const parsed = parseCSV(ev.target?.result as string)
      save([...terms, ...parsed])
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleExport = () => {
    if (!terms.length) return
    const csv  = exportCSV(terms)
    const blob = new Blob([csv], { type: 'text/csv; charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = 'leksis-glossary.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div className="fixed inset-0 z-[55]" onClick={onClose} aria-hidden="true" />
      )}

      {/* Panel — matches Leksis_old: w-[26rem], white bg, translate-x animation */}
      <div
        id="glossaryPanel"
        className={`fixed right-0 top-0 h-full w-[26rem] max-w-full bg-white shadow-2xl border-l border-outline-variant/10 transform transition-transform duration-300 z-[60] flex flex-col ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="glossaryPanelTitle"
        aria-hidden={!open}
      >
        {/* Header */}
        <div className="p-4 border-b border-outline-variant/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary" aria-hidden="true">menu_book</span>
            <h3 id="glossaryPanelTitle" className="font-bold font-['Manrope']">{t.glossary.title}</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-900 transition-colors"
            title={t.glossary.close}
            aria-label={t.glossary.close}
          >✕</button>
        </div>

        {/* Column headers */}
        <div className="px-4 pt-3 pb-1.5 flex items-center gap-2 text-xs font-semibold text-on-surface-variant border-b border-outline-variant/10 shrink-0">
          <span className="flex-1">{t.glossary.sourceTerm}</span>
          <span className="w-4 shrink-0" />
          <span className="flex-1">{t.glossary.translation}</span>
          <span className="w-7 shrink-0" />
        </div>

        {/* Term list (scrollable) */}
        <div className="flex-1 overflow-y-auto px-4 py-2">
          {terms.length === 0 ? (
            <p className="text-xs text-on-surface-variant py-4 text-center">{t.glossary.noTerms}</p>
          ) : (
            terms.map((term, i) => (
              <div key={i} className="flex items-center gap-2 py-1.5 border-b border-outline-variant/10 last:border-0">
                <span className="flex-1 text-xs text-on-surface truncate">{term.source}</span>
                <span className="material-symbols-outlined text-outline text-sm shrink-0">arrow_forward</span>
                <span className="flex-1 text-xs text-on-surface truncate">{term.target}</span>
                <button
                  onClick={() => handleRemove(i)}
                  className="shrink-0 w-7 flex items-center justify-center text-outline hover:text-error transition-colors"
                  aria-label="Remove term"
                >
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              </div>
            ))
          )}
        </div>

        {/* Add + actions — matches Leksis_old footer */}
        <div className="p-4 border-t border-outline-variant/10 space-y-3 shrink-0">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={addSource}
              onChange={e => setAddSource(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              placeholder={t.glossary.sourceTermInput}
              className="flex-1 min-w-0 bg-surface-container text-xs text-on-surface border border-outline-variant/20 rounded-lg px-3 py-2 focus:outline-none focus:border-primary/50 placeholder:text-on-surface-variant"
            />
            <span className="text-outline text-xs shrink-0">→</span>
            <input
              type="text"
              value={addTarget}
              onChange={e => setAddTarget(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              placeholder={t.glossary.translationInput}
              className="flex-1 min-w-0 bg-surface-container text-xs text-on-surface border border-outline-variant/20 rounded-lg px-3 py-2 focus:outline-none focus:border-primary/50 placeholder:text-on-surface-variant"
            />
            <button
              onClick={handleAdd}
              disabled={!addSource.trim() || !addTarget.trim()}
              className="shrink-0 p-2 bg-primary text-on-primary rounded-lg hover:bg-primary-dim transition-colors disabled:opacity-40"
              title={t.glossary.addTerm}
              aria-label={t.glossary.addTerm}
            >
              <span className="material-symbols-outlined text-sm leading-none" aria-hidden="true">add</span>
            </button>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <input ref={fileRef} type="file" id="glossaryFileInput" accept=".csv,text/csv" className="hidden" onChange={handleImport} />
            <button onClick={() => fileRef.current?.click()} className="text-button text-xs gap-1">
              <span className="material-symbols-outlined text-sm">upload_file</span>{t.glossary.importCsv}
            </button>
            <button onClick={handleExport} disabled={!terms.length} className="text-button text-xs gap-1 disabled:opacity-40">
              <span className="material-symbols-outlined text-sm">download</span>{t.glossary.exportCsv}
            </button>
            <button onClick={() => save([])} disabled={!terms.length} className="text-button text-xs gap-1 ml-auto disabled:opacity-40">
              <span className="material-symbols-outlined text-sm text-error">delete_sweep</span>
              <span className="text-error">{t.glossary.clearAll}</span>
            </button>
          </div>

          <p className="text-xs text-on-surface-variant leading-relaxed">
            {t.glossary.autoInjectNote}
          </p>
        </div>
      </div>
    </>
  )
}

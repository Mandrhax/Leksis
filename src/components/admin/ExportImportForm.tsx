'use client'

import { useRef, useState } from 'react'
import type { ToastState }  from './AdminToast'
import { useI18n }          from '@/lib/i18n'

interface Props {
  onToast: (t: ToastState) => void
}

const KNOWN_KEYS = ['branding', 'design', 'features', 'rewrite_tones', 'general', 'seo', 'ollama_config', 'db_config']

export function ExportImportForm({ onToast }: Props) {
  const { t } = useI18n()
  const fileRef = useRef<HTMLInputElement>(null)

  const [exporting, setExporting]   = useState(false)
  const [importing, setImporting]   = useState(false)
  const [detectedKeys, setDetected] = useState<string[] | null>(null)
  const [pendingJson, setPending]   = useState<object | null>(null)
  const [fileName, setFileName]     = useState<string>('')

  /* ── Export ─────────────────────────────────────────────── */
  async function handleExport() {
    setExporting(true)
    try {
      const res = await fetch('/api/admin/settings/export')
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const date = new Date().toISOString().slice(0, 10)
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `leksis-config-${date}.json`
      a.click()
      URL.revokeObjectURL(url)
      onToast({ message: t.backupForm.toastExported, type: 'success' })
    } catch {
      onToast({ message: t.backupForm.toastError, type: 'error' })
    } finally {
      setExporting(false)
    }
  }

  /* ── Sélection fichier ───────────────────────────────────── */
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setPending(null)
    setDetected(null)

    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target?.result as string)
        if (!json.version || !json.settings || typeof json.settings !== 'object') {
          onToast({ message: t.backupForm.errorInvalidFile, type: 'error' })
          return
        }
        const keys = Object.keys(json.settings).filter(k => KNOWN_KEYS.includes(k))
        setDetected(keys)
        setPending(json)
      } catch {
        onToast({ message: t.backupForm.errorInvalidFile, type: 'error' })
      }
    }
    reader.readAsText(file)

    // Reset input pour permettre re-sélection du même fichier
    e.target.value = ''
  }

  /* ── Import ──────────────────────────────────────────────── */
  async function handleImport() {
    if (!pendingJson) return
    setImporting(true)
    try {
      const res = await fetch('/api/admin/settings/import', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(pendingJson),
      })
      if (!res.ok) throw new Error()
      onToast({ message: t.backupForm.toastImported, type: 'success' })
      setTimeout(() => window.location.reload(), 800)
    } catch {
      onToast({ message: t.backupForm.toastError, type: 'error' })
    } finally {
      setImporting(false)
    }
  }

  /* ── UI ──────────────────────────────────────────────────── */
  return (
    <div className="space-y-6">

      {/* Export */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-xl text-on-surface-variant leading-none" aria-hidden="true">cloud_download</span>
          <h3 className="font-headline font-semibold text-base text-on-surface">{t.backupForm.exportSection}</h3>
        </div>
        <p className="text-sm text-on-surface-variant">{t.backupForm.exportDesc}</p>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="action-btn disabled:opacity-40"
        >
          {exporting ? (
            <span className="material-symbols-outlined animate-spin text-base leading-none" aria-hidden="true">progress_activity</span>
          ) : (
            <span className="material-symbols-outlined text-base leading-none" aria-hidden="true">download</span>
          )}
          {t.backupForm.exportButton}
        </button>
      </div>

      {/* Import */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-xl text-on-surface-variant leading-none" aria-hidden="true">cloud_upload</span>
          <h3 className="font-headline font-semibold text-base text-on-surface">{t.backupForm.importSection}</h3>
        </div>
        <p className="text-sm text-on-surface-variant">{t.backupForm.importDesc}</p>

        {/* Avertissement */}
        <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20 text-sm text-on-surface-variant">
          <span className="material-symbols-outlined text-base leading-none mt-0.5 shrink-0 text-primary" aria-hidden="true">info</span>
          <p>{t.backupForm.importWarning}</p>
        </div>

        {/* Zone de sélection */}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="text-button"
          >
            <span className="material-symbols-outlined text-base leading-none" aria-hidden="true">folder_open</span>
            {t.backupForm.importButton}
          </button>
          {fileName && (
            <span className="text-sm text-on-surface-variant truncate max-w-xs">{fileName}</span>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".json"
          className="sr-only"
          onChange={handleFileChange}
        />

        {/* Résumé des clés détectées */}
        {detectedKeys && (
          <div className="p-3 rounded-lg bg-surface-container border border-outline-variant/20 text-sm text-on-surface space-y-1">
            <p className="font-medium">
              {t.backupForm.importDetected.replace('{0}', detectedKeys.length.toString())}
            </p>
            <p className="text-xs text-on-surface-variant">{detectedKeys.join(', ')}</p>
          </div>
        )}

        {/* Bouton Restore */}
        {pendingJson && (
          <button
            onClick={handleImport}
            disabled={importing}
            className="action-btn disabled:opacity-40"
          >
            {importing ? (
              <span className="material-symbols-outlined animate-spin text-base leading-none" aria-hidden="true">progress_activity</span>
            ) : (
              <span className="material-symbols-outlined text-base leading-none" aria-hidden="true">restore</span>
            )}
            {importing ? t.backupForm.restoring : t.backupForm.restoreButton}
          </button>
        )}
      </div>

    </div>
  )
}

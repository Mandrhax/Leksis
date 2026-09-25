'use client'

import { useRef, useState } from 'react'
import { AdminToast }       from './AdminToast'
import type { ToastState }  from './AdminToast'
import { useI18n }          from '@/lib/i18n'
import { timeAgo }          from '@/lib/relative-time'

const KNOWN_KEYS = ['branding', 'design', 'features', 'rewrite_tones', 'general', 'ollama_config', 'ai_config', 'glossaries']

interface Props {
  lastBackupAt: string | null
}

export function ExportImportForm({ lastBackupAt }: Props) {
  const { t } = useI18n()
  const fileRef = useRef<HTMLInputElement>(null)

  const [exporting, setExporting]   = useState(false)
  const [importing, setImporting]   = useState(false)
  const [detectedKeys, setDetected] = useState<string[] | null>(null)
  const [pendingJson, setPending]   = useState<object | null>(null)
  const [fileName, setFileName]     = useState<string>('')
  const [toast, setToast]           = useState<ToastState>(null)

  const [now] = useState(() => Date.now()) // fixed at mount: render must stay pure
  const backupOk = lastBackupAt != null && (now - new Date(lastBackupAt).getTime()) <= 8 * 24 * 60 * 60 * 1000

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
      setToast({ message: t.backupForm.toastExported, type: 'success' })
    } catch {
      setToast({ message: t.backupForm.toastError, type: 'error' })
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
          setToast({ message: t.backupForm.errorInvalidFile, type: 'error' })
          return
        }
        const keys = Object.keys(json.settings).filter(k => KNOWN_KEYS.includes(k))
        if (Array.isArray(json.glossaries) && json.glossaries.length > 0) keys.push('glossaries')
        if (json.assets?.logo)       keys.push('logo')
        if (json.assets?.background) keys.push('background')
        setDetected(keys)
        setPending(json)
      } catch {
        setToast({ message: t.backupForm.errorInvalidFile, type: 'error' })
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
      setToast({ message: t.backupForm.toastImported, type: 'success' })
      setTimeout(() => window.location.reload(), 800)
    } catch {
      setToast({ message: t.backupForm.toastError, type: 'error' })
    } finally {
      setImporting(false)
    }
  }

  /* ── UI ──────────────────────────────────────────────────── */
  return (
    <>
    <div className="space-y-6">

      {/* Full server backup — console only, this page never does this */}
      <div className={`rounded-xl border p-6 space-y-3 ${backupOk ? 'border-[rgba(39,174,96,0.2)] bg-[rgba(39,174,96,0.04)]' : 'border-error/25 bg-error/5'}`}>
        <div className="flex items-center gap-2">
          <span
            className="material-symbols-outlined text-xl leading-none"
            style={{ color: backupOk ? '#27ae60' : '#9f403d' }}
            aria-hidden="true"
          >
            {backupOk ? 'cloud_done' : 'cloud_off'}
          </span>
          <h3 className="font-headline font-semibold text-base text-on-surface flex-1">{t.backupForm.fullBackupTitle}</h3>
          <span className="text-sm text-on-surface-variant">
            {t.backupForm.fullBackupLast}: <span className="font-medium text-on-surface">
              {lastBackupAt ? timeAgo(lastBackupAt, t.adminPages) : t.backupForm.fullBackupNever}
            </span>
          </span>
        </div>
        <p className="text-sm text-on-surface-variant">{t.backupForm.fullBackupDesc}</p>
        <code className="inline-block text-xs bg-surface-container px-2 py-1 rounded text-on-surface">leksis backup</code>
      </div>

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

    <AdminToast toast={toast} onDismiss={() => setToast(null)} />
    </>
  )
}

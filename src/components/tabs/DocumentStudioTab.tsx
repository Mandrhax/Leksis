'use client'

import { useState, useRef, useCallback } from 'react'
import { LanguageDropdown } from '@/components/ui/LanguageDropdown'
import { LANGUAGES } from '@/lib/languages'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { useI18n } from '@/lib/i18n'
import type { Block, Language } from '@/types/leksis'

const DEFAULT_TARGET: Language = { code: 'fr', name: 'French' }
const DOC_TARGET_KEY = 'leksisDocTargetLang'

type Mode = 'extract' | 'translate'

function escapeHtml(str: string) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function blocksToHtml(blocks: Block[]): string {
  return blocks.map(block => {
    if (block.type === 'page-break') {
      return '<hr class="border-outline-variant/20 my-4" />'
    }
    if (block.type === 'html') {
      // Raw HTML from vision OCR model — render as-is
      return block.content
    }
    if (block.type === 'heading') {
      const tag = block.level === 1 ? 'h2' : 'h3'
      const cls = block.level === 1
        ? 'text-lg font-bold text-on-surface mt-4 mb-2 first:mt-0'
        : 'text-base font-semibold text-on-surface mt-3 mb-1 first:mt-0'
      return `<${tag} class="${cls}">${escapeHtml(block.text)}</${tag}>`
    }
    if (block.type === 'table') {
      const thCls = 'border border-outline-variant/30 px-3 py-1.5 text-left text-xs font-semibold bg-surface-container text-on-surface'
      const tdCls = 'border border-outline-variant/30 px-3 py-1.5 text-xs text-on-surface/90'
      const headers = block.headers.map(h => `<th class="${thCls}">${escapeHtml(h)}</th>`).join('')
      const rows    = block.rows.map(r =>
        '<tr>' + r.map(c => `<td class="${tdCls}">${escapeHtml(c)}</td>`).join('') + '</tr>'
      ).join('')
      return `<div class="overflow-x-auto my-3"><table class="border-collapse text-sm w-full"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table></div>`
    }
    return `<p class="text-sm text-on-surface/90 leading-relaxed mb-2">${escapeHtml(block.text)}</p>`
  }).join('')
}

function blocksToText(blocks: Block[]): string {
  return blocks.map(block => {
    if (block.type === 'page-break') return '---'
    if (block.type === 'paragraph' || block.type === 'heading') return block.text
    if (block.type === 'html') return block.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    if (block.type === 'table') {
      const rows = [block.headers, ...block.rows]
      return rows.map(r => r.join('\t')).join('\n')
    }
    return ''
  }).filter(Boolean).join('\n\n')
}

// File type icons using Bootstrap Icons class names (matching Leksis_old)
const FILE_ICONS: Record<string, string> = {
  pdf: 'bi-file-earmark-pdf-fill', docx: 'bi-file-earmark-word-fill', doc: 'bi-file-earmark-word-fill',
  txt: 'bi-file-earmark-text-fill', csv: 'bi-file-earmark-spreadsheet-fill',
  png: 'bi-file-earmark-image-fill', jpg: 'bi-file-earmark-image-fill',
  jpeg: 'bi-file-earmark-image-fill', webp: 'bi-file-earmark-image-fill',
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

interface Props {
  defaultSourceLang?: string
  defaultTargetLang?: string
}

export function DocumentStudioTab({ defaultTargetLang }: Props) {
  const { t } = useI18n()
  const [file, setFile]             = useState<File | null>(null)
  const [mode, setMode]             = useState<Mode>('translate')
  const [sourceLang, setSourceLang] = useState<Language | null>(null)
  const [targetLang, setTargetLang] = useState<Language>(() => {
    try {
      const r = localStorage.getItem(DOC_TARGET_KEY)
      if (r) return JSON.parse(r)
      if (defaultTargetLang && defaultTargetLang !== 'auto') {
        const found = LANGUAGES.find(l => l.code === defaultTargetLang)
        if (found) return found
      }
    } catch { /* ignore */ }
    return DEFAULT_TARGET
  })
  const [isLoading, setIsLoading]   = useState(false)
  const [step, setStep]             = useState<'extracting' | 'translating' | null>(null)
  const [error, setError]           = useState<string | null>(null)
  const [outputHtml, setOutputHtml] = useState<string>('')
  const [outputBlocks, setOutputBlocks] = useState<Block[] | null>(null)

  const abortRef  = useRef<AbortController | null>(null)
  const fileRef   = useRef<HTMLInputElement>(null)
  const outputRef = useRef<HTMLDivElement>(null)

  const handleFile = (f: File) => {
    setFile(f)
    setOutputHtml('')
    setOutputBlocks(null)
    setError(null)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }

  const abort = () => {
    abortRef.current?.abort()
    abortRef.current = null
    setIsLoading(false)
    setStep(null)
  }

  const handleAction = useCallback(async () => {
    if (!file) return
    abort()

    const controller = new AbortController()
    abortRef.current = controller
    setIsLoading(true)
    setError(null)
    setStep('extracting')

    const formData = new FormData()
    formData.append('file', file)

    try {
      if (mode === 'extract') {
        const res = await fetch('/api/extract/document', {
          method: 'POST',
          body: formData,
          signal: controller.signal,
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error((data as { error?: string }).error || `HTTP ${res.status}`)
        }
        const data = await res.json() as { blocks: Block[] }
        setOutputBlocks(data.blocks)
        setOutputHtml(blocksToHtml(data.blocks))
      } else {
        formData.append('targetLang', targetLang.name)
        if (sourceLang) formData.append('sourceLang', sourceLang.name)

        setStep('translating')
        const res = await fetch('/api/translate/document', {
          method: 'POST',
          body: formData,
          signal: controller.signal,
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error((data as { error?: string }).error || `HTTP ${res.status}`)
        }
        const data = await res.json() as { blocks: Block[] }
        setOutputBlocks(data.blocks)
        setOutputHtml(blocksToHtml(data.blocks))
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError((err as Error).message)
    } finally {
      setIsLoading(false)
      setStep(null)
    }
  }, [file, mode, targetLang, sourceLang])

  const handleTargetLangChange = (lang: Language) => {
    setTargetLang(lang)
    try { localStorage.setItem(DOC_TARGET_KEY, JSON.stringify(lang)) } catch { /* ignore */ }
  }

  const handleClearInput = () => { abort(); setFile(null); setOutputHtml(''); setOutputBlocks(null); setError(null) }
  const handleClearOutput = () => { setOutputHtml(''); setOutputBlocks(null) }

  const [copied, copy] = useCopyToClipboard()
  const handleCopy = () => { if (outputRef.current) copy(outputRef.current.innerText) }

  const handleDownloadTxt = useCallback(() => {
    if (!outputBlocks) return
    const text = blocksToText(outputBlocks)
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const baseName = file?.name.replace(/\.[^.]+$/, '') ?? 'document'
    const suffix = mode === 'translate' ? `.${targetLang.code}` : ''
    const filename = `${baseName}${suffix}.txt`
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(a.href)
  }, [outputBlocks, file, mode, targetLang])

  const handleDownloadDocx = useCallback(async () => {
    if (!outputBlocks) return
    const baseName = file?.name.replace(/\.[^.]+$/, '') ?? 'document'
    const suffix = mode === 'translate' ? `.${targetLang.code}` : ''
    const filename = `${baseName}${suffix}.docx`

    try {
      const res = await fetch('/api/export/docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocks: outputBlocks, filename }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError((data as { error?: string }).error || `Export failed: HTTP ${res.status}`)
        return
      }
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(a.href)
    } catch (err) {
      setError((err as Error).message)
    }
  }, [outputBlocks, file, mode, targetLang])

  const ext    = file?.name.split('.').pop()?.toLowerCase() ?? ''
  const biIcon = FILE_ICONS[ext] ?? 'bi-file-earmark-fill'

  // Progress toaster — steps are conditional on mode
  const progressSteps = mode === 'extract'
    ? [{ label: t.docTab.extractingContent, active: step === 'extracting', done: false }]
    : [
        { label: t.docTab.extractingContent, active: step === 'extracting', done: step === 'translating' },
        { label: t.docTab.translating,       active: step === 'translating', done: false },
      ]

  const placeholder = mode === 'extract'
    ? t.docTab.extractedPlaceholder
    : t.docTab.translatedPlaceholder

  return (
    <div id="docsTab">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-surface-container overflow-hidden rounded-xl border border-outline-variant/10 relative">

        {/* Left — Upload */}
        <div className="bg-surface-container-lowest p-8 flex flex-col h-[600px]">
          <div className="flex justify-between items-center mb-6">
            <LanguageDropdown
              value={sourceLang ?? { code: 'auto', name: t.langDropdown.autoDetect }}
              onChange={l => setSourceLang(l.code === 'auto' ? null : l)}
              includeAutoDetect
              variant="source"
            />
            <button onClick={handleClearInput} className="text-button">
              <span>{t.docTab.clear}</span>
              <span className="material-symbols-outlined text-lg" aria-hidden="true">close</span>
            </button>
          </div>

          {/* Drop zone (no file) */}
          {!file && (
            <div
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
              onClick={() => fileRef.current?.click()}
              className="flex-grow flex flex-col items-center justify-center border-2 border-dashed border-outline-variant/30 rounded-lg hover:border-primary/50 hover:bg-primary/5 transition-all cursor-pointer group mb-4"
            >
              <span className="material-symbols-outlined text-4xl text-outline-variant/50 group-hover:text-primary/50 transition-colors mb-3">cloud_upload</span>
              <p className="text-sm font-medium text-on-surface-variant text-center mb-1">{t.docTab.dropHere}</p>
              <p className="text-xs text-on-surface-variant text-center">{t.docTab.clickToBrowse}</p>
              <p className="text-xs text-on-surface-variant text-center mt-3">{t.docTab.acceptedFormats}</p>
            </div>
          )}

          {/* File preview card */}
          {file && (
            <div
              onClick={() => fileRef.current?.click()}
              title={t.docTab.clickToChange}
              className="flex-grow flex flex-col items-center justify-center border-2 border-primary/30 bg-primary/5 rounded-lg mb-4 cursor-pointer hover:border-primary/60 transition-all"
            >
              <i className={`bi ${biIcon} text-6xl text-primary/60 mb-3`} />
              <p className="text-sm font-semibold text-on-surface text-center px-4 truncate max-w-full">{file.name}</p>
              <p className="text-xs text-on-surface-variant mt-1">{formatFileSize(file.size)}</p>
              <p className="text-xs text-primary/60 mt-3">{t.docTab.clickToChange}</p>
            </div>
          )}

          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept=".pdf,.docx,.doc,.txt,.csv"
            onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]) }}
          />

          <div className="mt-4">
            <button
              onClick={handleAction}
              disabled={!file || isLoading}
              className="action-btn"
            >
              {isLoading
                ? <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                : <span className="material-symbols-outlined text-sm">{mode === 'extract' ? 'document_scanner' : 'translate'}</span>
              }
              <span>{mode === 'extract' ? t.docTab.extract : t.docTab.translate}</span>
            </button>
          </div>
        </div>

        {/* Right — Output */}
        <div className="bg-surface-container-low p-8 flex flex-col h-[600px]">
          <div className="flex justify-between items-center mb-6">
            {mode === 'translate' && (
              <LanguageDropdown
                value={targetLang}
                onChange={handleTargetLangChange}
                variant="target"
              />
            )}
            {mode === 'extract' && (
              <span className="text-xs font-bold text-on-surface tracking-wider uppercase">{t.docTab.extractedText}</span>
            )}
            <button onClick={handleClearOutput} className="text-button ml-auto">
              <span>{t.docTab.clear}</span>
              <span className="material-symbols-outlined text-lg" aria-hidden="true">close</span>
            </button>
          </div>

          <div ref={outputRef} className="flex-grow translation-text text-on-surface/90 overflow-y-auto">
            {error ? (
              <span className="text-error text-sm">{error}</span>
            ) : isLoading ? (
              /* Progress toaster */
              <div className="flex items-center justify-center h-full min-h-[300px]">
                <div className="flex flex-col gap-3 p-5 rounded-xl border border-outline-variant/20 bg-surface-container-lowest">
                  <p className="text-xs font-bold text-on-surface tracking-wider uppercase mb-1">{t.docTab.processing}</p>
                  {progressSteps.map((s, i) => (
                    <div key={i} className="flex items-center gap-2.5">
                      {s.done ? (
                        <span className="material-symbols-outlined text-base text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                      ) : s.active ? (
                        <span className="material-symbols-outlined animate-spin text-base text-primary">progress_activity</span>
                      ) : (
                        <span className="material-symbols-outlined text-base text-outline-variant">radio_button_unchecked</span>
                      )}
                      <span className={`text-sm ${s.done ? 'text-primary font-medium' : s.active ? 'text-on-surface font-medium' : 'text-outline-variant'}`}>
                        {s.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : outputHtml ? (
              <div dangerouslySetInnerHTML={{ __html: outputHtml }} />
            ) : (
              <span className="text-on-surface-variant italic font-light">{placeholder}</span>
            )}
          </div>

          <div className="mt-4 flex items-center justify-end">
            <div className="flex items-center gap-2">
              {copied && <span className="text-xs text-primary font-medium bg-primary/10 px-2 py-0.5 rounded-full">{t.docTab.copied}</span>}
              <button
                onClick={handleDownloadTxt}
                disabled={!outputBlocks}
                className="p-2 hover:bg-surface-container-high rounded-md transition-colors disabled:opacity-30"
                title={t.docTab.downloadTxt}
              >
                <span className="material-symbols-outlined text-on-surface-variant">download</span>
              </button>
              <button
                onClick={handleDownloadDocx}
                disabled={!outputBlocks}
                className="p-2 hover:bg-surface-container-high rounded-md transition-colors disabled:opacity-30"
                title={t.docTab.downloadDocx}
              >
                <span className="material-symbols-outlined text-on-surface-variant">description</span>
              </button>
              <button
                onClick={handleCopy}
                disabled={!outputHtml}
                className="p-2 hover:bg-surface-container-high rounded-md transition-colors disabled:opacity-30"
                title={t.docTab.copy}
              >
                <span className="material-symbols-outlined text-on-surface-variant">content_copy</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mode toolbar */}
      <div className="flex justify-center items-center z-40 pt-4 pb-2">
        <div className="toolbar rewrite-toolbar px-4 py-2.5">
          <div className="flex flex-wrap items-center justify-center gap-3 md:gap-4">
            <span className="text-xs font-bold text-on-surface tracking-wider">{t.docTab.mode}</span>
            <div className="boundaries">
              <button onClick={() => setMode('extract')}   className={`formal-btn ${mode === 'extract'   ? 'active' : ''}`}>{t.docTab.extractOnly}</button>
              <button onClick={() => setMode('translate')} className={`formal-btn ${mode === 'translate' ? 'active' : ''}`}>{t.docTab.extractAndTranslate}</button>
            </div>
            {mode === 'translate' && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-on-surface-variant">→</span>
                <LanguageDropdown
                  value={targetLang}
                  onChange={handleTargetLangChange}
                  variant="target"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

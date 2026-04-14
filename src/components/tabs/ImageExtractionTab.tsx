'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { LanguageDropdown } from '@/components/ui/LanguageDropdown'
import { LANGUAGES, detectLanguage } from '@/lib/languages'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { useI18n } from '@/lib/i18n'
import type { Language } from '@/types/leksis'

const DEFAULT_TARGET: Language = { code: 'fr', name: 'French' }
const IMG_TARGET_KEY = 'leksisImgTargetLang'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function stripInlineHtml(html: string): string {
  return html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .trim()
}

function renderHtmlTable(html: string): string {
  const headers: string[] = []
  const rows: string[][] = []

  const theadMatch = html.match(/<thead[\s\S]*?<\/thead>/i)
  const tbodyMatch = html.match(/<tbody[\s\S]*?<\/tbody>/i)

  if (theadMatch) {
    const thMatches = [...theadMatch[0].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)]
    thMatches.forEach(m => headers.push(stripInlineHtml(m[1])))
  }

  const rowSource = tbodyMatch ? tbodyMatch[0] : html
  const trMatches = [...rowSource.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
  trMatches.forEach(tr => {
    const cells = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
    if (cells.length) rows.push(cells.map(c => escapeHtml(stripInlineHtml(c[1]))))
  })

  if (!headers.length && !rows.length) return ''
  const thead = headers.length ? `<thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>` : ''
  const tbody = rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')
  return `<table>${thead}<tbody>${tbody}</tbody></table>`
}

function renderMarkdownSegment(md: string): string {
  const lines = md.split('\n')
  const out: string[] = []
  let mdTableBuffer: string[] = []

  const flushMdTable = () => {
    if (mdTableBuffer.length < 2) {
      out.push(...mdTableBuffer.map(l => `<p>${escapeHtml(l)}</p>`))
      mdTableBuffer = []
      return
    }
    const cols = mdTableBuffer[0].split('|').filter((_, i, a) => i > 0 && i < a.length - 1)
    const headers = cols.map(h => `<th>${escapeHtml(h.trim())}</th>`).join('')
    const rows = mdTableBuffer.slice(2).map(r => {
      const cells = r.split('|').filter((_, i, a) => i > 0 && i < a.length - 1)
        .map(c => `<td>${escapeHtml(c.trim())}</td>`).join('')
      return `<tr>${cells}</tr>`
    }).join('')
    out.push(`<table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`)
    mdTableBuffer = []
  }

  for (const line of lines) {
    if (line.startsWith('| ') || line.startsWith('|---')) { mdTableBuffer.push(line); continue }
    if (mdTableBuffer.length) flushMdTable()
    if (line.startsWith('# '))   { out.push(`<h1>${escapeHtml(line.slice(2).trim())}</h1>`); continue }
    if (line.startsWith('### ')) { out.push(`<h3>${escapeHtml(line.slice(4).trim())}</h3>`); continue }
    if (line.startsWith('## '))  { out.push(`<h2>${escapeHtml(line.slice(3).trim())}</h2>`); continue }
    if (line.trim() === '')      { out.push('<br>'); continue }
    out.push(`<p>${escapeHtml(line).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</p>`)
  }
  if (mdTableBuffer.length) flushMdTable()
  return out.join('')
}

function renderMarkdown(md: string): string {
  // Split on <table>...</table> boundaries — LightOnOCR-2 mixes plain text and HTML tables
  const parts = md.split(/(<table[\s\S]*?<\/table>)/gi)
  return parts.map(part => {
    if (/^<table/i.test(part.trim())) return renderHtmlTable(part)
    return renderMarkdownSegment(part)
  }).join('')
}

type Mode = 'extract' | 'translate'

interface Props {
  defaultTargetLang?: string
}

export function ImageExtractionTab({ defaultTargetLang }: Props) {
  const { t } = useI18n()
  const [file, setFile]         = useState<File | null>(null)
  const [preview, setPreview]   = useState<string | null>(null)
  const [mode, setMode]         = useState<Mode>('extract')
  const [targetLang, setTargetLang] = useState<Language>(() => {
    try {
      const r = localStorage.getItem(IMG_TARGET_KEY)
      if (r) return JSON.parse(r)
      if (defaultTargetLang && defaultTargetLang !== 'auto') {
        const found = LANGUAGES.find(l => l.code === defaultTargetLang)
        if (found) return found
      }
    } catch { /* ignore */ }
    return DEFAULT_TARGET
  })
  const [outputText, setOutputText]     = useState('')
  const [detectedLang, setDetectedLang] = useState<string | null>(null)
  const [wordCount, setWordCount]       = useState<number | null>(null)
  const [isLoading, setIsLoading]       = useState(false)
  const [step, setStep]                 = useState<'extracting' | 'translating' | null>(null)
  const [error, setError]               = useState<string | null>(null)
  const [fileName, setFileName]         = useState<string | null>(null)

  const abortRef  = useRef<AbortController | null>(null)
  const fileRef   = useRef<HTMLInputElement>(null)
  const outputRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = outputRef.current
    if (el && isLoading) el.scrollTop = el.scrollHeight
  }, [outputText, isLoading])

  const handleFile = (f: File) => {
    if (!f.type.startsWith('image/')) return
    setFile(f)
    setFileName(f.name)
    setOutputText('')
    setError(null)
    setDetectedLang(null)
    setWordCount(null)
    const url = URL.createObjectURL(f)
    setPreview(url)
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

  const handleExtract = useCallback(async () => {
    if (!file) return
    abort()

    const controller = new AbortController()
    abortRef.current = controller
    setIsLoading(true)
    setError(null)
    setOutputText('')
    setDetectedLang(null)
    setWordCount(null)
    setStep('extracting')

    try {
      const formData = new FormData()
      formData.append('image', file)

      const res = await fetch('/api/ocr', { method: 'POST', body: formData, signal: controller.signal })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error || `HTTP ${res.status}`)
      }

      const reader  = res.body!.getReader()
      const decoder = new TextDecoder()
      let extracted = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        extracted += decoder.decode(value, { stream: true })
      }
      setOutputText(extracted)

      const detected = detectLanguage(extracted)
      setDetectedLang(detected?.name ?? null)
      setWordCount(extracted.trim().split(/\s+/).filter(Boolean).length)

      if (mode === 'translate' && extracted.trim()) {
        setStep('translating')

        const transRes = await fetch('/api/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: extracted,
            sourceLang: detected?.name ?? 'Unknown',
            sourceCode: detected?.code ?? 'auto',
            targetLang: targetLang.name,
            targetCode: targetLang.code,
            markdownMode: true,
          }),
          signal: controller.signal,
        })

        if (!transRes.ok) {
          const data = await transRes.json().catch(() => ({}))
          throw new Error((data as { error?: string }).error || `HTTP ${transRes.status}`)
        }

        const transReader  = transRes.body!.getReader()
        const transDecoder = new TextDecoder()
        let translated = ''
        while (true) {
          const { done, value } = await transReader.read()
          if (done) break
          translated += transDecoder.decode(value, { stream: true })
        }
        setOutputText(translated)
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError((err as Error).message)
    } finally {
      setIsLoading(false)
      setStep(null)
    }
  }, [file, mode, targetLang])

  const handleClearInput = () => {
    abort()
    setFile(null)
    setPreview(null)
    setFileName(null)
    setOutputText('')
    setDetectedLang(null)
    setWordCount(null)
    setError(null)
  }
  const handleClearOutput = () => { setOutputText(''); setDetectedLang(null); setWordCount(null) }
  const [copied, copy] = useCopyToClipboard()
  const handleCopy = () => { if (outputText) copy(outputText) }

  const handleTargetLangChange = (lang: Language) => {
    setTargetLang(lang)
    try { localStorage.setItem(IMG_TARGET_KEY, JSON.stringify(lang)) } catch { /* ignore */ }
  }

  const showStats = !!outputText && !isLoading

  const progressSteps = mode === 'extract'
    ? [{ label: t.imgTab.extractingText, active: step === 'extracting', done: false }]
    : [
        { label: t.imgTab.extractingText, active: step === 'extracting', done: step === 'translating' },
        { label: t.imgTab.translating,    active: step === 'translating', done: false },
      ]

  return (
    <div id="imgTab">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-surface-container overflow-hidden rounded-xl border border-outline-variant/10 relative">

        {/* Left — Image upload */}
        <div className="bg-surface-container-lowest p-8 flex flex-col h-[600px]">
          <div className="flex justify-between items-center mb-6">
            <span className="text-xs font-bold text-on-surface-variant tracking-wider uppercase">{t.imgTab.sourceImage}</span>
            <button onClick={handleClearInput} className="text-button">
              <span>{t.imgTab.clear}</span>
              <span className="material-symbols-outlined text-lg" aria-hidden="true">close</span>
            </button>
          </div>

          {/* Drop zone / preview */}
          <div
            id="imgUploadArea"
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
            onClick={() => fileRef.current?.click()}
            className="flex-grow flex flex-col items-center justify-center border-2 border-dashed border-outline-variant/30 rounded-lg hover:border-primary/50 hover:bg-primary/5 transition-all cursor-pointer group mb-4 relative overflow-hidden"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {preview && <img src={preview} alt="Preview" className="absolute inset-0 w-full h-full object-contain p-2" />}
            {!preview && (
              <div className="flex flex-col items-center">
                <span className="material-symbols-outlined text-4xl text-outline-variant/50 group-hover:text-primary/50 transition-colors mb-3">add_photo_alternate</span>
                <p className="text-sm font-medium text-on-surface-variant text-center mb-1">{t.imgTab.dropHere}</p>
                <p className="text-xs text-on-surface-variant text-center">{t.imgTab.clickToBrowse}</p>
                <p className="text-xs text-on-surface-variant text-center mt-3">{t.imgTab.acceptedFormats}</p>
              </div>
            )}
          </div>

          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]) }}
          />

          <div className="mt-2 text-xs text-on-surface-variant mb-4">
            <p className="truncate text-on-surface-variant">{fileName ?? t.imgTab.noImageSelected}</p>
          </div>

          <button
            onClick={handleExtract}
            disabled={!file || isLoading}
            className="action-btn w-fit"
          >
            {isLoading
              ? <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
              : <span className="material-symbols-outlined text-sm">document_scanner</span>
            }
            <span>{t.imgTab.extractText}</span>
          </button>
        </div>

        {/* Right — Extracted text */}
        <div className="bg-surface-container-low p-8 flex flex-col h-[600px]">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-3 flex-wrap min-w-0">
              <span className="text-xs font-bold text-on-surface tracking-wider uppercase shrink-0">{t.imgTab.extractedText}</span>
              {showStats && (
                <div className="flex items-center gap-3 flex-wrap">
                  {detectedLang && (
                    <div className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm text-outline">language</span>
                      <span className="text-xs text-on-surface-variant">{detectedLang}</span>
                    </div>
                  )}
                  {mode === 'translate' && (
                    <div className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm text-outline">arrow_forward</span>
                      <span className="text-xs text-on-surface-variant">{targetLang.name}</span>
                    </div>
                  )}
                  {wordCount !== null && (
                    <div className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm text-outline">format_list_numbered</span>
                      <span className="text-xs text-on-surface-variant"><span className="font-semibold text-on-surface">{wordCount}</span> words</span>
                    </div>
                  )}
                </div>
              )}
            </div>
            <button onClick={handleClearOutput} className="text-button shrink-0 ml-4">
              <span>{t.imgTab.clear}</span>
              <span className="material-symbols-outlined text-lg" aria-hidden="true">close</span>
            </button>
          </div>

          <div ref={outputRef} className="flex-grow translation-text text-on-surface/90 overflow-y-auto">
            {error ? (
              <span className="text-error text-sm">{error}</span>
            ) : isLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="flex flex-col gap-3 p-5 rounded-xl border border-outline-variant/20 bg-surface-container-lowest">
                  <p className="text-xs font-bold text-on-surface tracking-wider uppercase mb-1">{t.imgTab.processing}</p>
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
            ) : outputText ? (
              <div dangerouslySetInnerHTML={{ __html: renderMarkdown(outputText) }} />
            ) : (
              <span className="text-on-surface-variant italic font-light">{t.imgTab.outputPlaceholder}</span>
            )}
          </div>

          <div className="mt-4 flex items-center justify-end">
            <div className="flex items-center gap-2">
              {copied && <span className="text-xs text-primary font-medium bg-primary/10 px-2 py-0.5 rounded-full">{t.imgTab.copied}</span>}
              <button
                onClick={handleCopy}
                disabled={!outputText}
                className="p-2 hover:bg-surface-container-high rounded-md transition-colors disabled:opacity-30"
                title={t.imgTab.copied}
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
            <span className="text-xs font-bold text-on-surface tracking-wider">{t.imgTab.mode}</span>
            <div className="boundaries">
              <button onClick={() => setMode('extract')}   className={`formal-btn ${mode === 'extract'    ? 'active' : ''}`}>{t.imgTab.extractOnly}</button>
              <button onClick={() => setMode('translate')} className={`formal-btn ${mode === 'translate'  ? 'active' : ''}`}>{t.imgTab.extractAndTranslate}</button>
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

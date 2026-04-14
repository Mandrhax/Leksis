'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { LanguageDropdown } from '@/components/ui/LanguageDropdown'
import { LANGUAGES, detectLanguage } from '@/lib/languages'
import { TEXT_MAX_CHARS } from '@/lib/validators'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { useI18n } from '@/lib/i18n'
import type { Language, Formality } from '@/types/leksis'

const DEFAULT_TARGET: Language = { code: 'fr', name: 'French' }
const TARGET_KEY = 'leksisTargetLang'

function loadTargetLang(defaultCode?: string): Language {
  try {
    const r = localStorage.getItem(TARGET_KEY)
    if (r) return JSON.parse(r)
    if (defaultCode && defaultCode !== 'auto') {
      const found = LANGUAGES.find(l => l.code === defaultCode)
      if (found) return found
    }
  } catch { /* ignore */ }
  return DEFAULT_TARGET
}

interface Props {
  defaultSourceLang?: string
  defaultTargetLang?: string
  maxTextChars?:      number
}

export function TextTranslationTab({ defaultTargetLang, maxTextChars = TEXT_MAX_CHARS }: Props) {
  const { t } = useI18n()

  const [sourceText, setSourceText]     = useState('')
  const [outputText, setOutputText]     = useState('')
  const [sourceLang, setSourceLang]     = useState<Language | null>(null)
  const [detectedLang, setDetectedLang] = useState<Language | null>(null)
  const [targetLang, setTargetLang]     = useState<Language>(DEFAULT_TARGET)
  const [formality, setFormality]       = useState<Formality>('Informal')
  const [isLoading, setIsLoading]       = useState(false)
  const [error, setError]               = useState<string | null>(null)

  const abortRef    = useRef<AbortController | null>(null)
  const detectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const transTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { setTargetLang(loadTargetLang(defaultTargetLang)) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    try { localStorage.setItem(TARGET_KEY, JSON.stringify(targetLang)) } catch { /* ignore */ }
  }, [targetLang])

  const abort = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    if (detectTimer.current) { clearTimeout(detectTimer.current); detectTimer.current = null }
    if (transTimer.current)  { clearTimeout(transTimer.current);  transTimer.current  = null }
    setIsLoading(false)
  }, [])

  const isFormalityActive = useCallback((src: Language | null, detected: Language | null) => {
    const code = src?.code ?? detected?.code ?? ''
    return code.startsWith('en')
  }, [])

  const runTranslation = useCallback(async (
    text: string, src: Language | null, detected: Language | null, tgt: Language, fmt: Formality
  ) => {
    if (!text.trim()) { setOutputText(''); return }

    abort()
    const controller = new AbortController()
    abortRef.current = controller
    setIsLoading(true)
    setError(null)
    setOutputText('')

    const effectiveSrc = src ?? detected

    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          sourceLang: effectiveSrc?.name ?? 'Unknown',
          sourceCode: effectiveSrc?.code ?? 'auto',
          targetLang: tgt.name,
          targetCode: tgt.code,
          formality: isFormalityActive(src, detected) ? fmt : null,
        }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error || `HTTP ${res.status}`)
      }

      const reader  = res.body!.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })
        setOutputText(accumulated)
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError((err as Error).message)
    } finally {
      setIsLoading(false)
    }
  }, [abort, isFormalityActive])

  const handleTextChange = (text: string) => {
    setSourceText(text)
    if (!text.trim()) { abort(); setOutputText(''); setDetectedLang(null); return }

    if (detectTimer.current) clearTimeout(detectTimer.current)
    if (transTimer.current)  clearTimeout(transTimer.current)

    if (sourceLang === null) {
      detectTimer.current = setTimeout(() => {
        const detected = detectLanguage(text)
        setDetectedLang(detected)
        transTimer.current = setTimeout(() => {
          runTranslation(text, null, detected, targetLang, formality)
        }, 800)
      }, 400)
    } else {
      transTimer.current = setTimeout(() => {
        runTranslation(text, sourceLang, null, targetLang, formality)
      }, 800)
    }
  }

  const handleSourceLangChange = (lang: Language) => {
    const isAuto = lang.code === 'auto'
    setSourceLang(isAuto ? null : lang)
    if (sourceText.trim()) {
      if (isAuto) {
        const detected = detectLanguage(sourceText)
        setDetectedLang(detected)
        runTranslation(sourceText, null, detected, targetLang, formality)
      } else {
        runTranslation(sourceText, lang, null, targetLang, formality)
      }
    }
  }

  const handleTargetLangChange = (lang: Language) => {
    setTargetLang(lang)
    if (sourceText.trim()) runTranslation(sourceText, sourceLang, detectedLang, lang, formality)
  }

  const handleSwap = () => {
    const effectiveSrc = sourceLang ?? detectedLang
    if (!outputText.trim() || !effectiveSrc) return
    const newSource = targetLang        // old target becomes new source
    const newTarget = effectiveSrc      // old source becomes new target
    const textToTranslate = outputText
    setSourceText(textToTranslate)
    setOutputText('')
    setSourceLang(newSource)
    setDetectedLang(null)
    setTargetLang(newTarget)
    setTimeout(() => runTranslation(textToTranslate, newSource, null, newTarget, formality), 0)
  }

  const handleClearInput = () => {
    abort()
    setSourceText('')
    setOutputText('')
    setSourceLang(null)
    setDetectedLang(null)
    setError(null)
  }

  const handleClearOutput = () => setOutputText('')

  const [copied, copy] = useCopyToClipboard()
  const handleCopy = () => { if (outputText) copy(outputText) }

  const handleFormality = (f: Formality) => {
    setFormality(f)
    if (sourceText.trim()) runTranslation(sourceText, sourceLang, detectedLang, targetLang, f)
  }

  const formalityActive = isFormalityActive(sourceLang, detectedLang)
  const sourceLangValue = sourceLang ?? { code: 'auto', name: t.langDropdown.autoDetect }

  return (
    <div id="textTab">
      {/* Two-panel grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-surface-container overflow-hidden rounded-xl border border-outline-variant/10 relative">

        {/* Left — Source */}
        <div className="bg-surface-container-lowest p-8 flex flex-col h-[600px]">
          <div className="flex justify-between items-center mb-6">
            <LanguageDropdown
              value={sourceLangValue}
              onChange={handleSourceLangChange}
              includeAutoDetect
              variant="source"
            />
            <button onClick={handleClearInput} className="text-button">
              <span>{t.textTab.clear}</span>
              <span className="material-symbols-outlined text-lg" aria-hidden="true">close</span>
            </button>
          </div>
          <textarea
            value={sourceText}
            onChange={e => handleTextChange(e.target.value)}
            placeholder={t.textTab.inputPlaceholder}
            className="w-full flex-grow bg-transparent border-none focus:ring-0 translation-text placeholder:text-on-surface-variant resize-none outline-none"
            spellCheck={false}
          />
          <div className="mt-4 flex items-center justify-between">
            <button
              onClick={() => { if (sourceText.trim()) runTranslation(sourceText, sourceLang, detectedLang, targetLang, formality) }}
              disabled={isLoading || !sourceText.trim() || sourceText.length > maxTextChars}
              className="action-btn"
            >
              {isLoading
                ? <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                : <span className="material-symbols-outlined text-sm">translate</span>
              }
              <span>{t.textTab.translate}</span>
            </button>
            <span className={`text-xs font-medium ${sourceText.length >= maxTextChars ? 'text-error' : 'text-outline'}`}>{sourceText.length} / {maxTextChars}</span>
          </div>
        </div>

        {/* Right — Output */}
        <div className="bg-surface-container-low p-8 flex flex-col h-[600px]">
          <div className="flex justify-between items-center mb-6">
            <LanguageDropdown
              value={targetLang}
              onChange={handleTargetLangChange}
              variant="target"
            />
            <button onClick={handleClearOutput} className="text-button">
              <span>{t.textTab.clear}</span>
              <span className="material-symbols-outlined text-lg" aria-hidden="true">close</span>
            </button>
          </div>
          <div className="flex-grow translation-text text-on-surface/90 overflow-y-auto">
            {error ? (
              <span className="text-error text-sm">{error}</span>
            ) : outputText ? (
              <span className="whitespace-pre-wrap">{outputText}</span>
            ) : (
              <span className="text-on-surface-variant italic font-light">{t.textTab.outputPlaceholder}</span>
            )}
          </div>
          <div className="mt-4 flex items-center justify-end">
            <div className="flex items-center gap-2">
              {copied && <span className="text-xs text-primary font-medium bg-primary/10 px-2 py-0.5 rounded-full">{t.textTab.copied}</span>}
              <button
                onClick={handleCopy}
                disabled={!outputText}
                className="p-2 hover:bg-surface-container-high rounded-md transition-colors disabled:opacity-30"
                title={t.textTab.clear}
              >
                <span className="material-symbols-outlined text-on-surface-variant">content_copy</span>
              </button>
            </div>
          </div>
        </div>

        {/* Swap button — centered between panels */}
        <div className="hidden md:flex absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
          <div
            onClick={handleSwap}
            className="bg-surface-container-lowest p-2 rounded-full border border-outline-variant/20 shadow-sm cursor-pointer hover:bg-surface-container transition-colors flex items-center justify-center"
            role="button"
            aria-label={t.textTab.swapLanguages}
          >
            <span className="material-symbols-outlined text-outline leading-none">swap_horiz</span>
          </div>
        </div>
      </div>

      {/* Formality toolbar */}
      <div className="flex justify-center items-center z-40 pt-4 pb-2">
        <div className={`toolbar rewrite-toolbar px-4 py-2.5 transition-opacity duration-200 ${!formalityActive ? 'opacity-40 pointer-events-none' : ''}`}>
          <div className="flex flex-wrap items-center justify-center gap-3 md:gap-4">
            <span className="text-xs font-bold text-on-surface tracking-wider">{t.textTab.formality}</span>
            <div className="boundaries">
              <button
                onClick={() => handleFormality('Informal')}
                className={`formal-btn ${formality === 'Informal' ? 'active' : ''}`}
                disabled={!formalityActive}
              >{t.textTab.informal}</button>
              <button
                onClick={() => handleFormality('Formal')}
                className={`formal-btn ${formality === 'Formal' ? 'active' : ''}`}
                disabled={!formalityActive}
              >{t.textTab.formal}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

'use client'

import { useState, useRef, useCallback } from 'react'
import { detectLanguage } from '@/lib/languages'
import { getGlossary, buildRewriteGlossaryClause } from '@/lib/glossary'
import { TEXT_MAX_CHARS } from '@/lib/validators'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { useI18n } from '@/lib/i18n'
import type { Messages } from '@/locales/en'
import type { RewriteMode, RewriteLength, ToneConfig } from '@/types/leksis'

const LENGTHS: RewriteLength[] = ['Shorter', 'Keep', 'Longer']

type RewriteTabMessages = Messages['rewriteTab']

const LENGTH_LABELS: Record<RewriteLength, keyof RewriteTabMessages> = {
  Shorter: 'shorter',
  Keep:    'keep',
  Longer:  'longer',
}

interface Props {
  maxTextChars?:    number
  configuredTones?: ToneConfig[]
}

const DEFAULT_TONES_FALLBACK: ToneConfig[] = [
  { id: 'professional', labels: { en: 'Professional' }, instruction: 'in a professional, formal tone appropriate for business communication' },
]

export function AIRewriteTab({ maxTextChars = TEXT_MAX_CHARS, configuredTones = DEFAULT_TONES_FALLBACK }: Props) {
  const { t } = useI18n()

  const { locale } = useI18n()
  const activeTones = configuredTones.filter(tn => tn.enabled !== false)

  function toneLabel(tn: typeof configuredTones[0]): string {
    return (tn.labels?.[locale] ?? tn.labels?.en) || tn.id
  }

  const [inputText, setInputText]   = useState('')
  const [outputText, setOutputText] = useState('')
  const [mode, setMode]     = useState<RewriteMode>('rewrite')
  const [tone, setTone]     = useState<string>(() => activeTones[0]?.id ?? 'professional')
  const [length, setLength] = useState<RewriteLength>('Keep')
  const [isLoading, setIsLoading]   = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [appliedMode, setAppliedMode] = useState<RewriteMode | null>(null)
  const [appliedTone, setAppliedTone] = useState<string | null>(null)
  const [appliedLength, setAppliedLength] = useState<RewriteLength | null>(null)

  const abortRef = useRef<AbortController | null>(null)

  const abort = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setIsLoading(false)
  }, [])

  const run = useCallback(async (text: string, m: RewriteMode, tn: string, l: RewriteLength) => {
    if (!text.trim()) return

    abort()
    const controller = new AbortController()
    abortRef.current = controller
    setIsLoading(true)
    setError(null)
    setOutputText('')
    setAppliedMode(null)

    const detectedLang   = detectLanguage(text)
    const glossaryClause = buildRewriteGlossaryClause(getGlossary(), text)

    try {
      const res = await fetch('/api/rewrite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          mode: m,
          tone: tn,
          length: l,
          glossaryClause,
          sourceLang: detectedLang?.name,
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

      setAppliedMode(m)
      setAppliedTone(tn)
      setAppliedLength(l)
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError((err as Error).message)
    } finally {
      setIsLoading(false)
    }
  }, [abort])

  const handleClearInput  = () => { abort(); setInputText(''); setOutputText(''); setError(null); setAppliedMode(null) }
  const handleClearOutput = () => { setOutputText(''); setAppliedMode(null) }
  const [copied, copy] = useCopyToClipboard()
  const handleCopy = () => { if (outputText) copy(outputText) }

  return (
    <div id="rewriteTab">
      {/* Two-panel grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-surface-container overflow-hidden rounded-xl border border-outline-variant/10">

        {/* Left — Input */}
        <div className="bg-surface-container-lowest p-8 flex flex-col h-[600px]">
          <div className="flex justify-between items-center mb-6">
            <span className="text-xs font-bold text-on-surface-variant tracking-wider uppercase">{t.rewriteTab.autoDetect}</span>
            <button onClick={handleClearInput} className="text-button">
              <span>{t.rewriteTab.clear}</span>
              <span className="material-symbols-outlined text-lg" aria-hidden="true">close</span>
            </button>
          </div>
          <textarea
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            placeholder={t.rewriteTab.inputPlaceholder}
            className="w-full flex-grow bg-transparent border-none focus:ring-0 translation-text placeholder:text-on-surface-variant resize-none outline-none"
            spellCheck={false}
          />
          <div className="mt-4 flex items-center justify-between">
            <button
              onClick={() => run(inputText, mode, tone, length)}
              disabled={isLoading || !inputText.trim() || inputText.length > maxTextChars}
              className="action-btn"
            >
              {isLoading
                ? <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                : <span className="material-symbols-outlined text-sm">auto_fix_high</span>
              }
              <span id="rewriteBtnLabel">{mode === 'correct' ? t.rewriteTab.correct : t.rewriteTab.rewrite}</span>
            </button>
            <span className={`text-xs font-medium ${inputText.length >= maxTextChars ? 'text-error' : 'text-outline'}`}>{inputText.length} / {maxTextChars}</span>
          </div>
        </div>

        {/* Right — Output */}
        <div className="bg-surface-container-low p-8 flex flex-col h-[600px]">
          <div className="flex justify-between items-center mb-6">
            {appliedMode ? (
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-sm text-primary">tips_and_updates</span>
                <span className="text-xs text-on-surface-variant">
                  <span className="font-semibold text-primary">
                    {appliedMode === 'correct' ? t.rewriteTab.correctApplied : t.rewriteTab.rewriteApplied}
                  </span>
                  {appliedMode === 'rewrite' && appliedTone && appliedLength && (
                    <>
                      {' '}· {t.rewriteTab.toneLabel} <span className="font-semibold text-primary">{(() => { const tn = activeTones.find(tn => tn.id === appliedTone); return tn ? toneLabel(tn) : appliedTone })()} </span>
                      {' '}· {t.rewriteTab.lengthLabel} <span className="font-semibold">{t.rewriteTab[LENGTH_LABELS[appliedLength]]}</span>
                    </>
                  )}
                </span>
              </div>
            ) : (
              <div />
            )}
            <button onClick={handleClearOutput} className="text-button">
              <span>{t.rewriteTab.clear}</span>
              <span className="material-symbols-outlined text-lg" aria-hidden="true">close</span>
            </button>
          </div>
          <div className="flex-grow translation-text text-on-surface/90 overflow-y-auto">
            {error ? (
              <span className="text-error text-sm">{error}</span>
            ) : outputText ? (
              <span className="whitespace-pre-wrap">{outputText}</span>
            ) : (
              <span className="text-on-surface-variant italic font-light">{t.rewriteTab.outputPlaceholder}</span>
            )}
          </div>
          <div className="mt-4 flex items-center justify-end">
            <div className="flex items-center gap-2">
              {copied && <span className="text-xs text-primary font-medium bg-primary/10 px-2 py-0.5 rounded-full">{t.rewriteTab.copied}</span>}
              <button
                onClick={handleCopy}
                disabled={!outputText}
                className="p-2 hover:bg-surface-container-high rounded-md transition-colors disabled:opacity-30"
                title={t.rewriteTab.copied}
              >
                <span className="material-symbols-outlined text-on-surface-variant">content_copy</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex justify-center items-center z-40 pt-4 pb-2">
        <div className="toolbar rewrite-toolbar px-4 py-2.5">
          <div className="flex flex-wrap items-center justify-center gap-3 md:gap-4">
            {/* Mode */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-on-surface tracking-wider">{t.rewriteTab.mode}</span>
              <div className="boundaries">
                <button onClick={() => setMode('rewrite')} className={`formal-btn ${mode === 'rewrite' ? 'active' : ''}`}>{t.rewriteTab.rewriteMode}</button>
                <button onClick={() => setMode('correct')} className={`formal-btn ${mode === 'correct' ? 'active' : ''}`}>{t.rewriteTab.correctOnly}</button>
              </div>
            </div>

            <div className="hidden md:block h-4 w-px bg-outline-variant/30" />

            {/* Tone */}
            <div className={`flex items-center gap-2 transition-opacity duration-200 ${mode === 'correct' ? 'opacity-30 pointer-events-none' : ''}`}>
              <span className="text-xs font-bold text-on-surface tracking-wider">{t.rewriteTab.tone}</span>
              <div className="flex flex-wrap gap-1">
                {activeTones.map(tn => (
                  <button
                    key={tn.id}
                    onClick={() => setTone(tn.id)}
                    className={`tone-btn ${tone === tn.id ? 'active' : ''}`}
                  >
                    {toneLabel(tn)}
                  </button>
                ))}
              </div>
            </div>

            <div className="hidden md:block h-4 w-px bg-outline-variant/30" />

            {/* Length */}
            <div className={`flex items-center gap-2 transition-opacity duration-200 ${mode === 'correct' ? 'opacity-30 pointer-events-none' : ''}`}>
              <span className="text-xs font-bold text-on-surface tracking-wider">{t.rewriteTab.length}</span>
              <div className="boundaries">
                {LENGTHS.map(l => (
                  <button
                    key={l}
                    onClick={() => setLength(l)}
                    className={`formal-btn ${length === l ? 'active' : ''}`}
                  >
                    {t.rewriteTab[LENGTH_LABELS[l]]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

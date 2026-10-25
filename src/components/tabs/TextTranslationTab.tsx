'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { LanguageDropdown } from '@/components/ui/LanguageDropdown'
import { detectLanguage } from '@/lib/languages'
import { detectRegister, hasFormalAddress } from '@/lib/register-detect'
import { TEXT_MAX_CHARS } from '@/lib/validators'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { MicButton } from '@/components/ui/MicButton'
import { useI18n } from '@/lib/i18n'
import type { Language, Formality } from '@/types/leksis'
import { ReportResultLink } from '@/components/ui/ReportResultLink'
import type { FeedbackCategory } from '@/lib/feedback-schema'
import type { UsageTrigger } from '@/lib/usage-schema'
import { TranslationScheduler, fetchTranslation, type TranslationInput, type SkipReason } from '@/lib/translate-scheduler'
import { TEXT_TRANSLATION_DEFAULTS, toTextTriggers, type TextTriggerConfig } from '@/lib/text-translation-config'
import { ApiResponseError, apiErrorMessage } from '@/lib/api-error'
import { DEFAULT_TARGET_LANGUAGE, loadStoredLanguage, saveStoredLanguage } from '@/lib/stored-language'
import { useAutoScroll } from '@/hooks/useAutoScroll'

const TEXT_TRIGGER_DEFAULTS = toTextTriggers(TEXT_TRANSLATION_DEFAULTS)

const TARGET_KEY = 'leksisTargetLang'

const loadTargetLang = (defaultCode?: string) => loadStoredLanguage(TARGET_KEY, defaultCode)

interface Props {
  defaultSourceLang?: string
  defaultTargetLang?: string
  maxTextChars?:      number
  defaultFormality?:  Formality
  /** Seuils de déclenchement (Réglages → Features & limits) */
  triggers?:          TextTriggerConfig
  voiceInputEnabled?: boolean
  /** Ouvre « Signaler un problème » avec cette catégorie (absent : bouton désactivé par l'admin) */
  onReport?:          (category: FeedbackCategory) => void
}

export function TextTranslationTab({ defaultTargetLang, maxTextChars = TEXT_MAX_CHARS, defaultFormality = 'Informal', triggers = TEXT_TRIGGER_DEFAULTS, voiceInputEnabled = false, onReport }: Props) {
  const { t } = useI18n()

  const [sourceText, setSourceText]     = useState('')
  const [outputText, setOutputText]     = useState('')
  const [sourceLang, setSourceLang]     = useState<Language | null>(null)
  const [detectedLang, setDetectedLang] = useState<Language | null>(null)
  const [targetLang, setTargetLang]     = useState<Language>(DEFAULT_TARGET_LANGUAGE)
  const [formality, setFormality]       = useState<Formality>(defaultFormality)
  // D'où vient le choix tu/vous affiché : lu dans le texte, réglage par défaut, ou clic de l'utilisateur
  const [formalityOrigin, setFormalityOrigin] = useState<'text' | 'default' | 'manual'>('default')
  const [isLoading, setIsLoading]       = useState(false)
  // Erreur d'API gardée telle quelle et traduite à l'affichage (suit aussi un changement de langue)
  const [error, setError]               = useState<string | ApiResponseError | null>(null)
  // La sortie affichée correspond à une version précédente du texte : atténuée jusqu'à la nouvelle
  const [isStale, setIsStale]           = useState(false)
  const [notice, setNotice]             = useState<SkipReason | null>(null)

  // Quand partir (debounce, immédiat) et annulation de la requête précédente : voir lib/translate-scheduler.ts
  const [scheduler] = useState(() => new TranslationScheduler(triggers, fetchTranslation, {
    onLoading: setIsLoading,
    onOutput:  setOutputText,
    onError:   (message, err) => setError(err instanceof ApiResponseError ? err : (message || null)),
    onStale:   setIsStale,
    // Seul « même langue » s'affiche : les autres cas (texte identique, trop court) se voient d'eux-mêmes
    onSkip:    reason => setNotice(reason === 'same_language' ? reason : null),
  }))
  useEffect(() => { scheduler.setConfig(triggers) }, [scheduler, triggers])
  useEffect(() => () => scheduler.cancel(), [scheduler])

  const pasteRef  = useRef(false)
  const outputRef = useRef<HTMLDivElement>(null)

  useAutoScroll(outputRef, outputText, isLoading)

  useEffect(() => { setTargetLang(loadTargetLang(defaultTargetLang)) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    saveStoredLanguage(TARGET_KEY, targetLang)
  }, [targetLang])

  // Tu / vous : utile dès que la langue CIBLE distingue les deux formes (pas vers l'anglais), quelle que soit la source
  const isFormalityActive = useCallback((tgt: Language) => hasFormalAddress(tgt.code), [])

  // Tant que l'utilisateur n'a pas choisi lui-même, le choix suit le texte source (lib/register-detect.ts), sinon
  // le réglage par défaut de l'admin. Son clic est gardé jusqu'à une nouvelle saisie (effacement, collage, swap).
  const formalityManualRef = useRef(false)
  const resolveFormality = useCallback((text: string, sourceCode: string | undefined, fmt: Formality): Formality => {
    if (formalityManualRef.current) return fmt
    const fromText = detectRegister(text, sourceCode)
    const value = fromText ?? defaultFormality
    setFormality(value)
    setFormalityOrigin(fromText ? 'text' : 'default')
    return value
  }, [defaultFormality])

  const buildInput = useCallback((
    text: string, src: Language | null, detected: Language | null, tgt: Language, fmt: Formality
  ): TranslationInput => {
    const effectiveSrc = src ?? detected
    return {
      text,
      sourceName: effectiveSrc?.name ?? 'Unknown',
      sourceCode: effectiveSrc?.code ?? 'auto',
      targetName: tgt.name,
      targetCode: tgt.code,
      formality:  isFormalityActive(tgt) ? resolveFormality(text, effectiveSrc?.code, fmt) : null,
      autoDetect: src === null,
    }
  }, [isFormalityActive, resolveFormality])

  const resetFormalityChoice = () => {
    formalityManualRef.current = false
    setFormality(defaultFormality)
    setFormalityOrigin('default')
  }

  const runTranslation = useCallback((
    text: string, src: Language | null, detected: Language | null, tgt: Language, fmt: Formality, trigger: UsageTrigger
  ) => {
    scheduler.request(() => buildInput(text, src, detected, tgt, fmt), trigger)
  }, [scheduler, buildInput])

  const handleTextChange = (text: string, trigger: UsageTrigger = 'typing') => {
    setSourceText(text)
    if (!text.trim()) { scheduler.reset(); setOutputText(''); setDetectedLang(null); return }

    if (sourceLang === null) {
      // Détection locale (sans appel IA) au moment du départ, sur le texte final de la rafale de frappe
      scheduler.request(() => {
        const detected = detectLanguage(text)
        setDetectedLang(detected)
        return buildInput(text, null, detected, targetLang, formality)
      }, trigger === 'typing' ? 'auto_detect' : trigger)
    } else {
      runTranslation(text, sourceLang, null, targetLang, formality, trigger)
    }
  }

  const handleInputChange = (text: string) => {
    const trigger: UsageTrigger = pasteRef.current ? 'paste' : 'typing'
    pasteRef.current = false
    handleTextChange(text, trigger)
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    pasteRef.current = true
    const el = e.currentTarget
    // Le collage remplace tout le texte : c'est une nouvelle saisie
    if (el.selectionStart === 0 && el.selectionEnd === el.value.length) { scheduler.newGroup(); resetFormalityChoice() }
  }

  const handleTranslateNow = () => {
    if (sourceText.trim()) runTranslation(sourceText, sourceLang, detectedLang, targetLang, formality, 'button')
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleTranslateNow() }
  }

  const handleDictated = (text: string) => {
    // Bloc de texte inséré d'un coup, comme un collage : pas d'attente de fin de frappe
    handleTextChange(sourceText.trim() ? `${sourceText.trim()} ${text}` : text, 'paste')
  }

  const handleSourceLangChange = (lang: Language) => {
    const isAuto = lang.code === 'auto'
    setSourceLang(isAuto ? null : lang)
    if (sourceText.trim()) {
      if (isAuto) {
        const detected = detectLanguage(sourceText)
        setDetectedLang(detected)
        runTranslation(sourceText, null, detected, targetLang, formality, 'lang_change')
      } else {
        runTranslation(sourceText, lang, null, targetLang, formality, 'lang_change')
      }
    }
  }

  const handleTargetLangChange = (lang: Language) => {
    setTargetLang(lang)
    if (sourceText.trim()) runTranslation(sourceText, sourceLang, detectedLang, lang, formality, 'lang_change')
  }

  const handleSwap = () => {
    const effectiveSrc = sourceLang ?? detectedLang
    if (!outputText.trim() || !effectiveSrc) return
    const newSource = targetLang        // old target becomes new source
    const newTarget = effectiveSrc      // old source becomes new target
    const textToTranslate = outputText
    scheduler.newGroup()
    resetFormalityChoice()
    setSourceText(textToTranslate)
    setOutputText('')
    setSourceLang(newSource)
    setDetectedLang(null)
    setTargetLang(newTarget)
    runTranslation(textToTranslate, newSource, null, newTarget, formality, 'lang_change')
  }

  const handleClearInput = () => {
    scheduler.reset()
    scheduler.newGroup()
    resetFormalityChoice()
    setSourceText('')
    setOutputText('')
    setSourceLang(null)
    setDetectedLang(null)
    setError(null)
  }

  const handleClearOutput = () => { scheduler.forget(); setOutputText('') }

  const [copied, copy] = useCopyToClipboard()
  const handleCopy = () => { if (outputText) copy(outputText) }

  const handleFormality = (f: Formality) => {
    formalityManualRef.current = true
    setFormalityOrigin('manual')
    setFormality(f)
    if (sourceText.trim()) runTranslation(sourceText, sourceLang, detectedLang, targetLang, f, 'lang_change')
  }

  const formalityActive = isFormalityActive(targetLang)
  // Auto-detect reveals what it actually detected (the source language label)
  const autoDetectLabel = detectedLang
    ? t.langDropdown.autoDetectWithLang.replace('{0}', detectedLang.name)
    : t.langDropdown.autoDetect
  const sourceLangValue = sourceLang ?? { code: 'auto', name: autoDetectLabel }

  return (
    <div id="textTab">
      {/* Two-panel grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-surface-container overflow-hidden rounded-xl border border-outline-variant/10 relative">

        {/* Left — Source */}
        <div className="bg-surface-container-lowest p-8 flex flex-col h-[420px] md:h-[600px]">
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
            onChange={e => handleInputChange(e.target.value)}
            onPaste={handlePaste}
            onKeyDown={handleKeyDown}
            placeholder={t.textTab.inputPlaceholder}
            maxLength={maxTextChars}
            className="w-full flex-grow bg-transparent border-none focus:ring-0 translation-text placeholder:text-on-surface-variant resize-none outline-none"
            spellCheck={false}
          />
          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {voiceInputEnabled && (
                <MicButton feature="text" onTranscript={handleDictated} disabled={isLoading} />
              )}
              <button
                onClick={handleTranslateNow}
                title={t.textTab.translateShortcut}
                disabled={isLoading || !sourceText.trim() || sourceText.length > maxTextChars}
                className="action-btn"
              >
                {isLoading
                  ? <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                  : <span className="material-symbols-outlined text-sm">translate</span>
                }
                <span>{t.textTab.translate}</span>
              </button>
            </div>
            <span className={`text-xs font-medium ${
              sourceText.length >= maxTextChars ? 'text-error' : sourceText.length >= maxTextChars * 0.9 ? 'text-amber-600' : 'text-outline'
            }`}>{sourceText.length} / {maxTextChars}</span>
          </div>
        </div>

        {/* Mobile-only swap button — in-flow between the two panels */}
        <div className="flex md:hidden items-center justify-center py-1">
          <button
            onClick={handleSwap}
            className="bg-surface-container-lowest p-2 rounded-full border border-outline-variant/20 shadow-sm hover:bg-surface-container transition-colors flex items-center justify-center"
            aria-label={t.textTab.swapLanguages}
          >
            <span className="material-symbols-outlined text-outline leading-none">swap_vert</span>
          </button>
        </div>

        {/* Right — Output */}
        <div className="bg-surface-container-low p-8 flex flex-col h-[420px] md:h-[600px]">
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
          <div ref={outputRef} className="flex-grow translation-text text-on-surface/90 overflow-y-auto">
            {error ? (
              <div className="flex items-center gap-3">
                <span className="text-error text-sm">{error instanceof ApiResponseError ? apiErrorMessage(t, error.body, error.status) : error}</span>
                <button
                  onClick={() => runTranslation(sourceText, sourceLang, detectedLang, targetLang, formality, 'button')}
                  className="text-button text-xs shrink-0"
                >
                  <span className="material-symbols-outlined text-sm" aria-hidden="true">refresh</span>
                  <span>{t.textTab.retry}</span>
                </button>
              </div>
            ) : outputText && !isLoading && !isStale ? (
              // Traduction terminée : modifiable avant de la copier (une nouvelle traduction la remplace)
              <textarea
                value={outputText}
                onChange={e => setOutputText(e.target.value)}
                aria-label={t.textTab.editResult}
                spellCheck
                className="w-full min-h-full field-sizing-content resize-none bg-transparent border-none outline-none p-0"
                style={{ font: 'inherit', color: 'inherit', lineHeight: 'inherit' }}
              />
            ) : outputText ? (
              <span className={`whitespace-pre-wrap transition-opacity ${isStale ? 'opacity-50' : ''}`} aria-busy={isLoading}>
                {outputText}
                {isLoading && <span className="inline-block w-[2px] h-[1em] bg-primary align-text-bottom ml-0.5 animate-pulse" aria-hidden="true" />}
              </span>
            ) : isLoading ? (
              <span className="inline-block w-[2px] h-[1em] bg-primary align-text-bottom animate-pulse" aria-hidden="true" />
            ) : notice === 'same_language' ? (
              <div role="status" className="flex flex-col items-center justify-center h-full text-center gap-2">
                <span className="material-symbols-outlined text-4xl text-outline-variant/60" aria-hidden="true">info</span>
                <span className="text-on-surface-variant text-sm max-w-xs">{t.textTab.sameLanguage}</span>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center gap-2">
                <span className="material-symbols-outlined text-4xl text-outline-variant/40" aria-hidden="true">translate</span>
                <span className="text-on-surface-variant italic font-light">{t.textTab.outputPlaceholder}</span>
              </div>
            )}
          </div>
          <div className="mt-4 flex items-center justify-between gap-2">
            <div className="min-w-0">
              {onReport && outputText && !isLoading && <ReportResultLink category={'translation'} onReport={onReport} />}
            </div>
            <div className="flex items-center gap-2">
              {copied && <span role="status" aria-live="polite" className="text-xs text-primary font-medium bg-primary/10 px-2 py-0.5 rounded-full">{t.textTab.copied}</span>}
              <button
                onClick={handleCopy}
                disabled={!outputText}
                className="p-2 hover:bg-surface-container-high rounded-md transition-colors disabled:opacity-30"
                title={t.textTab.copy}
                aria-label={t.textTab.copy}
              >
                <span className="material-symbols-outlined text-on-surface-variant">content_copy</span>
              </button>
            </div>
          </div>
        </div>

        {/* Swap button — centered between panels (desktop) */}
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
        <div
          className={`toolbar rewrite-toolbar px-4 py-2.5 transition-opacity duration-200 ${!formalityActive ? 'opacity-40 pointer-events-none' : ''}`}
          title={formalityActive ? undefined : t.textTab.formalityNotApplicable}
        >
          <div className="flex flex-wrap items-center justify-center gap-3 md:gap-4">
            <span className="text-xs font-bold text-on-surface tracking-wider">{t.textTab.formality}</span>
            <div className="boundaries">
              <button
                onClick={() => handleFormality('Informal')}
                aria-pressed={formality === 'Informal'}
                className={`formal-btn ${formality === 'Informal' ? 'active' : ''}`}
                disabled={!formalityActive}
              >{t.textTab.informal}</button>
              <button
                onClick={() => handleFormality('Formal')}
                aria-pressed={formality === 'Formal'}
                className={`formal-btn ${formality === 'Formal' ? 'active' : ''}`}
                disabled={!formalityActive}
              >{t.textTab.formal}</button>
            </div>
            {formalityActive && formalityOrigin === 'text' && sourceText.trim() && (
              <span className="flex items-center gap-1 text-xs text-on-surface-variant" data-testid="formality-detected">
                <span className="material-symbols-outlined text-sm leading-none" aria-hidden="true">auto_awesome</span>
                {t.textTab.formalityDetected}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

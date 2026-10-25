// Client-safe : décide QUAND l'onglet Texte lance une traduction. Sans React ni fetch (injectés) : testable sous Node.
//
// - frappe (`typing`, `auto_detect`) : attend une pause de `debounceMs` ;
// - collage, bouton / Ctrl+Entrée, changement de langue ou de ton : immédiat ;
// - une nouvelle traduction annule celle en cours (AbortController → le serveur coupe le modèle) et toute
//   réponse d'une version du texte qui n'est plus la courante est ignorée ;
// - rien ne part pour un texte déjà traduit, trop court ou vers sa propre langue (voir SkipReason).

import type { Formality } from '@/types/leksis'
import type { UsageTrigger } from '@/lib/usage-schema'
import type { TextTriggerConfig } from '@/lib/text-translation-config'
import { sameBaseLanguage } from '@/lib/languages'
import { ApiResponseError } from '@/lib/api-error'

export interface TranslationInput {
  text:       string
  sourceCode: string   // 'auto' quand la langue n'est ni choisie ni détectée
  sourceName: string
  targetCode: string
  targetName: string
  /** null quand le choix tu/vous ne s'applique pas (source non anglaise) */
  formality:  Formality | null
  /** Langue source en détection automatique */
  autoDetect: boolean
}

export interface TranslationBody {
  text:           string
  sourceLang:     string
  sourceCode:     string
  targetLang:     string
  targetCode:     string
  formality:      Formality | null
  trigger:        UsageTrigger
  requestGroupId: string
}

/** Envoie la requête et renvoie les fragments du flux de réponse, dans l'ordre */
export type TranslateFn = (body: TranslationBody, signal: AbortSignal) => AsyncIterable<string>

export interface SchedulerCallbacks {
  onLoading: (loading: boolean) => void
  /** Texte accumulé de la traduction en cours */
  onOutput:  (text: string) => void
  /** `error` : l'erreur d'origine (ApiResponseError pour une réponse HTTP en échec, traduite par l'onglet) */
  onError:   (message: string, error?: unknown) => void
  /** true : la traduction affichée correspond à une version précédente du texte (en attente de la nouvelle) */
  onStale:   (stale: boolean) => void
  /** Rien n'est parti, et pourquoi (null : une traduction est repartie) */
  onSkip:    (reason: SkipReason | null) => void
}

/**
 * - `identical` : même texte (aux espaces près), mêmes langues et même ton que la traduction affichée ou en cours ;
 * - `too_short` : moins de `minChars` caractères ;
 * - `auto_detect_wait` : détection auto, la frappe attend `autoDetectMinChars` (le bouton ne l'attend pas) ;
 * - `same_language` : source et cible de même langue de base (`fr` → `fr-CH`), message affiché.
 */
export type SkipReason = 'identical' | 'too_short' | 'auto_detect_wait' | 'same_language'

const DEBOUNCED: ReadonlySet<UsageTrigger> = new Set(['typing', 'auto_detect'])

/** Espaces et tabulations réduits, lignes nettoyées, lignes vides multiples ramenées à une : ne change pas la traduction */
export function normalizeForCompare(text: string): string {
  return text
    .split('\n')
    .map(line => line.replace(/[ \t ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function requestKey(input: TranslationInput): string {
  return JSON.stringify([normalizeForCompare(input.text), input.sourceCode, input.targetCode, input.formality])
}

/** Identifiant de saisie. `crypto.randomUUID` n'existe qu'en contexte sécurisé (HTTPS) : l'appliance tourne souvent en HTTP. */
export function newRequestGroupId(): string {
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

function isAbortError(err: unknown): boolean {
  return (err as { name?: string })?.name === 'AbortError'
}

export class TranslationScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null
  private controller: AbortController | null = null
  private groupId = newRequestGroupId()
  private version = 0
  /** Requête en cours, et dernière traduction arrivée au bout (celle qui est affichée) */
  private inFlightKey: string | null = null
  private shownKey: string | null = null

  constructor(
    private config: TextTriggerConfig,
    private translate: TranslateFn,
    private cb: SchedulerCallbacks,
  ) {}

  setConfig(config: TextTriggerConfig) { this.config = config }

  /** Nouvelle saisie (effacement, collage qui remplace tout, swap) : les requêtes suivantes forment un nouveau groupe */
  newGroup() { this.groupId = newRequestGroupId() }

  /**
   * Demande une traduction. `build` est évalué au moment du départ (après le debounce), pour lire
   * l'état le plus récent — détection de langue comprise.
   */
  request(build: () => TranslationInput, trigger: UsageTrigger): void {
    this.clearTimer()
    if (DEBOUNCED.has(trigger)) {
      this.timer = setTimeout(() => { this.timer = null; void this.start(build(), trigger) }, this.config.debounceMs)
    } else {
      void this.start(build(), trigger)
    }
  }

  /** Annule la traduction prévue ou en cours ; toute réponse encore en route est ignorée */
  cancel(): void {
    this.clearTimer()
    this.abortInFlight()
    this.inFlightKey = null
    this.version++
    this.cb.onStale(false)
    this.cb.onLoading(false)
  }

  private clearTimer() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null }
  }

  private abortInFlight() {
    this.controller?.abort()
    this.controller = null
  }

  /** La traduction affichée a été effacée : le même texte pourra être retraduit */
  forget(): void { this.shownKey = null }

  /** Texte source effacé : plus rien en cours ni d'affiché */
  reset(): void {
    this.cancel()
    this.forget()
    this.cb.onSkip(null)
  }

  private skipReason(input: TranslationInput, trigger: UsageTrigger, key: string): SkipReason | null {
    const length = normalizeForCompare(input.text).length
    if (length < this.config.minChars) return 'too_short'
    if (input.autoDetect && DEBOUNCED.has(trigger) && length < this.config.autoDetectMinChars) return 'auto_detect_wait'
    if (sameBaseLanguage(input.sourceCode, input.targetCode)) return 'same_language'
    if (key === this.inFlightKey || key === this.shownKey) return 'identical'
    return null
  }

  private async start(input: TranslationInput, trigger: UsageTrigger): Promise<void> {
    if (!input.text.trim()) { this.cancel(); this.shownKey = null; this.cb.onOutput(''); this.cb.onSkip(null); return }

    const key = requestKey(input)
    const skip = this.skipReason(input, trigger, key)
    if (skip === 'identical') {
      // Retour au texte affiché pendant qu'une autre version était en route : celle-ci n'est plus voulue
      if (key !== this.inFlightKey && this.controller) this.cancel()
      this.cb.onSkip(skip)
      return
    }
    if (skip) {
      // Plus rien d'affiché ne correspond au texte : on vide plutôt que de laisser une traduction périmée
      this.cancel()
      this.shownKey = null
      this.cb.onOutput('')
      this.cb.onSkip(skip)
      return
    }
    this.cb.onSkip(null)

    this.abortInFlight()
    this.inFlightKey = key
    const controller = new AbortController()
    this.controller = controller
    // Numéro de version : un fragment d'une requête remplacée entre-temps est ignoré, même si l'abandon
    // du fetch arrive trop tard (fragment déjà en mémoire, navigateur qui ne coupe pas tout de suite)
    const version = ++this.version
    const isCurrent = () => version === this.version
    this.cb.onLoading(true)
    this.cb.onError('')
    // L'ancienne traduction reste affichée (atténuée) jusqu'au premier fragment de la nouvelle
    this.cb.onStale(true)

    const body: TranslationBody = {
      text:           input.text,
      sourceLang:     input.sourceName,
      sourceCode:     input.sourceCode,
      targetLang:     input.targetName,
      targetCode:     input.targetCode,
      formality:      input.formality,
      trigger,
      requestGroupId: this.groupId,
    }

    let acc = ''
    let received = false
    try {
      for await (const chunk of this.translate(body, controller.signal)) {
        if (!isCurrent()) return
        acc += chunk
        received = true
        this.cb.onStale(false)
        this.cb.onOutput(acc)
      }
      // Réponse vide : l'ancienne traduction ne correspond plus au texte
      if (isCurrent() && !received) this.cb.onOutput('')
      if (isCurrent()) this.shownKey = key
    } catch (err) {
      if (isCurrent()) this.shownKey = null
      if (isCurrent() && !isAbortError(err)) this.cb.onError((err as Error).message || 'Error', err)
    } finally {
      if (isCurrent()) {
        this.controller = null
        this.inFlightKey = null
        this.cb.onStale(false)
        this.cb.onLoading(false)
      }
    }
  }
}

/** `TranslateFn` réel : POST /api/translate, flux de texte brut */
export async function* fetchTranslation(body: TranslationBody, signal: AbortSignal): AsyncIterable<string> {
  const res = await fetch('/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok || !res.body) {
    throw await ApiResponseError.from(res)
  }
  const reader  = res.body.getReader()
  const decoder = new TextDecoder()
  while (true) {
    const { done, value } = await reader.read()
    if (done) return
    yield decoder.decode(value, { stream: true })
  }
}

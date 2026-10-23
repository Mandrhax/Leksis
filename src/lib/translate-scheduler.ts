// Client-safe : décide QUAND l'onglet Texte lance une traduction. Sans React ni fetch (injectés) : testable sous Node.
//
// - frappe (`typing`, `auto_detect`) : attend une pause de `debounceMs` ;
// - collage, bouton / Ctrl+Entrée, changement de langue ou de ton : immédiat ;
// - une nouvelle traduction annule celle en cours (AbortController → le serveur coupe le modèle).

import type { Formality } from '@/types/leksis'
import type { UsageTrigger } from '@/lib/usage-schema'
import type { TextTriggerConfig } from '@/lib/text-translation-config'

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
  onError:   (message: string) => void
}

const DEBOUNCED: ReadonlySet<UsageTrigger> = new Set(['typing', 'auto_detect'])

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

  /** Annule la traduction prévue ou en cours */
  cancel(): void {
    this.clearTimer()
    this.abortInFlight()
    this.cb.onLoading(false)
  }

  private clearTimer() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null }
  }

  private abortInFlight() {
    this.controller?.abort()
    this.controller = null
  }

  private async start(input: TranslationInput, trigger: UsageTrigger): Promise<void> {
    if (!input.text.trim()) { this.cancel(); this.cb.onOutput(''); return }

    this.abortInFlight()
    const controller = new AbortController()
    this.controller = controller
    this.cb.onLoading(true)
    this.cb.onError('')
    this.cb.onOutput('')

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

    try {
      let acc = ''
      for await (const chunk of this.translate(body, controller.signal)) {
        acc += chunk
        this.cb.onOutput(acc)
      }
    } catch (err) {
      if (!isAbortError(err)) this.cb.onError((err as Error).message || 'Error')
    } finally {
      if (this.controller === controller) {
        this.controller = null
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
    const data = await res.json().catch(() => ({}))
    throw new Error((data as { error?: string }).error || `HTTP ${res.status}`)
  }
  const reader  = res.body.getReader()
  const decoder = new TextDecoder()
  while (true) {
    const { done, value } = await reader.read()
    if (done) return
    yield decoder.decode(value, { stream: true })
  }
}

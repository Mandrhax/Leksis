// Client-safe : décide QUAND l'onglet Texte lance une traduction. Sans React ni fetch (injectés) : testable sous Node.
//
// - frappe (`typing`, `auto_detect`) : attend une pause de `debounceMs` ;
// - collage, bouton / Ctrl+Entrée, changement de langue ou de ton : immédiat ;
// - une nouvelle traduction annule celle en cours (AbortController → le serveur coupe le modèle) et toute
//   réponse d'une version du texte qui n'est plus la courante est ignorée.

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
  /** true : la traduction affichée correspond à une version précédente du texte (en attente de la nouvelle) */
  onStale:   (stale: boolean) => void
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
  private version = 0

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

  private async start(input: TranslationInput, trigger: UsageTrigger): Promise<void> {
    if (!input.text.trim()) { this.cancel(); this.cb.onOutput(''); return }

    this.abortInFlight()
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
    } catch (err) {
      if (isCurrent() && !isAbortError(err)) this.cb.onError((err as Error).message || 'Error')
    } finally {
      if (isCurrent()) {
        this.controller = null
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

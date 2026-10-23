import 'server-only'
import { createHash } from 'node:crypto'

// Cache des traductions de texte, en mémoire du serveur uniquement (jamais sur disque ni en base) — l'app tourne
// en une seule instance, comme rate-limit.ts et llm/concurrency.ts. LRU : une Map garde l'ordre d'insertion, une
// lecture remet l'entrée en fin de file. Durée et taille viennent des réglages à chaque appel (features.textTranslation).
//
// Clé = sha256(utilisateur + modèle + prompt complet). Le prompt contient déjà langues, ton, glossaire et contexte :
// une traduction faite avec un autre glossaire ou un autre ton ne peut pas ressortir. Propre à chaque utilisateur :
// personne ne peut deviner, au temps de réponse, qu'un autre a déjà traduit le même texte.

interface Entry { value: string; expiresAt: number }

export interface CacheLimits {
  ttlMinutes: number
  maxEntries: number
}

export class TranslationCache {
  private entries = new Map<string, Entry>()

  constructor(private now: () => number = Date.now) {}

  static key(userId: string, model: string, prompt: string): string {
    return createHash('sha256').update(JSON.stringify([userId, model, prompt])).digest('hex')
  }

  get size(): number { return this.entries.size }

  get(key: string): string | undefined {
    const entry = this.entries.get(key)
    if (!entry) return undefined
    if (entry.expiresAt <= this.now()) { this.entries.delete(key); return undefined }
    this.entries.delete(key)
    this.entries.set(key, entry)
    return entry.value
  }

  set(key: string, value: string, limits: CacheLimits): void {
    if (limits.ttlMinutes <= 0 || limits.maxEntries <= 0) { this.entries.clear(); return }
    this.entries.delete(key)
    this.entries.set(key, { value, expiresAt: this.now() + limits.ttlMinutes * 60_000 })
    // Taille réduite dans l'admin : l'excédent part tout de suite, les plus anciennes d'abord
    for (const oldest of this.entries.keys()) {
      if (this.entries.size <= limits.maxEntries) break
      this.entries.delete(oldest)
    }
  }

  clear(): void { this.entries.clear() }
}

declare global {
  var _leksisTranslationCache: TranslationCache | undefined
}

/** Instance unique du serveur (survit au rechargement à chaud en développement) */
export const translationCache: TranslationCache = (globalThis._leksisTranslationCache ??= new TranslationCache())

/**
 * Laisse passer le flux tel quel et appelle `onComplete` avec le texte complet s'il est allé jusqu'au bout —
 * jamais pour une réponse coupée (annulation, erreur du moteur), qui serait une traduction tronquée.
 */
export function collectOnComplete(
  stream: ReadableStream<Uint8Array>,
  onComplete: (text: string) => void,
): ReadableStream<Uint8Array> {
  const reader  = stream.getReader()
  const decoder = new TextDecoder()
  let text = ''
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read()
        if (done) {
          text += decoder.decode()
          controller.close()
          if (text.trim()) onComplete(text)
          return
        }
        text += decoder.decode(value, { stream: true })
        controller.enqueue(value)
      } catch (err) {
        controller.error(err)
      }
    },
    cancel(reason) {
      return reader.cancel(reason)
    },
  })
}

/** Flux d'une traduction déjà connue (cache) */
export function streamOfText(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text))
      controller.close()
    },
  })
}

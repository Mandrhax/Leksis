import 'server-only'
import { TranslationCache, collectOnComplete, streamOfText, type CacheLimits } from '@/lib/translation-cache'
import { splitParagraphs, joinParagraphs } from '@/lib/text-segments'
import type { UsageEntry } from '@/lib/usage'

// Traduction incrémentale de l'onglet Texte : seuls les paragraphes nouveaux ou modifiés partent au modèle.
//
// 1. Texte entier déjà traduit (cache) → renvoyé tel quel, aucun appel.
// 2. Un seul paragraphe, ou plus de la moitié des paragraphes inconnus (première traduction comprise) → un seul
//    appel sur le texte entier, comme avant (cohérence complète). Si la traduction a autant de paragraphes que
//    la source, chaque paire est mise en cache : la modification suivante pourra n'envoyer qu'un paragraphe.
// 3. Sinon → les paragraphes connus sortent du cache tout de suite, chaque paragraphe inconnu est traduit seul,
//    dans l'ordre, avec le paragraphe source précédent comme contexte (réglage segmentContext).
//
// Le client ne voit qu'un flux de texte brut, dans l'ordre, comme pour un appel unique.
//
// La clé d'un paragraphe est celle de son prompt SANS contexte : modifier le paragraphe 3 ne rend pas inconnu
// le paragraphe 4 (dont le contexte a changé). Sa traduction en cache garde l'ancien contexte, ce qui suffit.

export interface IncrementalOptions {
  text:   string
  userId: string
  model:  string
  /** Prompt d'un texte (entier ou un paragraphe), glossaire filtré sur ce texte ; `context` : paragraphe précédent */
  buildPrompt: (text: string, context?: string) => string
  /** Appel au modèle (déjà sous la limite de concurrence et lié à l'annulation de la requête) */
  stream: (prompt: string) => ReadableStream<Uint8Array>
  cache:  TranslationCache
  limits: CacheLimits
  /** false : texte entier seulement (mode markdown d'Extract & translate) */
  incremental:    boolean
  segmentContext: boolean
  /** Complété ici : `status` (cache_hit) et `modelChars` */
  usage: UsageEntry
}

const encoder = new TextEncoder()

export function translateIncremental(o: IncrementalOptions): ReadableStream<Uint8Array> {
  const cacheOn = o.limits.ttlMinutes > 0 && o.limits.maxEntries > 0
  const keyOf = (prompt: string) => TranslationCache.key(o.userId, o.model, prompt)
  const get = (key: string) => (cacheOn ? o.cache.get(key) : undefined)
  const put = (key: string, value: string) => { if (cacheOn) o.cache.set(key, value, o.limits) }
  const fromCache = (text: string) => {
    o.usage.status     = 'cache_hit'
    o.usage.modelChars = 0
    return streamOfText(text)
  }

  const fullPrompt = o.buildPrompt(o.text)
  const fullKey    = keyOf(fullPrompt)
  const whole      = get(fullKey)
  if (whole !== undefined) return fromCache(whole)

  const { parts, separators } = o.incremental ? splitParagraphs(o.text) : { parts: [o.text], separators: [] }
  const partKeys = parts.map(p => keyOf(o.buildPrompt(p)))
  const known    = partKeys.map(get)
  const missing  = known.filter(k => k === undefined).length

  if (parts.length > 1 && missing === 0) {
    const assembled = joinParagraphs(known as string[], separators)
    put(fullKey, assembled)
    return fromCache(assembled)
  }

  if (parts.length <= 1 || missing * 2 > parts.length) {
    o.usage.modelChars = o.text.length
    return collectOnComplete(o.stream(fullPrompt), translated => {
      put(fullKey, translated)
      const out = splitParagraphs(translated)
      // Autant de paragraphes en sortie qu'en entrée : la correspondance est sûre, sinon on ne devine pas
      if (parts.length > 1 && out.parts.length === parts.length) out.parts.forEach((p, i) => put(partKeys[i], p))
    })
  }

  const contextOf = (i: number) => (o.segmentContext && i > 0 ? parts[i - 1] : undefined)
  o.usage.modelChars = parts.reduce((sum, p, i) => (known[i] === undefined ? sum + p.length + (contextOf(i)?.length ?? 0) : sum), 0)

  return streamFromGenerator((async function* () {
    const done: string[] = []
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) yield encoder.encode(separators[i - 1])
      const cached = known[i]
      if (cached !== undefined) {
        done.push(cached)
        yield encoder.encode(cached)
        continue
      }
      let translated = ''
      for await (const chunk of trimmedText(o.stream(o.buildPrompt(parts[i], contextOf(i))))) {
        translated += chunk
        yield encoder.encode(chunk)
      }
      put(partKeys[i], translated)
      done.push(translated)
    }
    // Arrivé au bout seulement (pas après une annulation) : le texte entier est connu aussi
    put(fullKey, joinParagraphs(done, separators))
  })())
}

/**
 * Texte d'un flux, sans espaces ni retours à la ligne en tête ou en fin : la traduction d'un paragraphe doit tenir
 * entre ses séparateurs. Les espaces de fin d'un fragment sont retenus jusqu'à savoir si du texte suit.
 */
async function* trimmedText(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader  = stream.getReader()
  const decoder = new TextDecoder()
  let started = false
  let pendingSpace = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) return
      let s = decoder.decode(value, { stream: true })
      if (!started) {
        s = s.replace(/^\s+/, '')
        if (!s) continue
        started = true
      }
      const trailing = /\s+$/.exec(s)
      const body = trailing ? s.slice(0, trailing.index) : s
      if (body) {
        yield pendingSpace + body
        pendingSpace = trailing ? trailing[0] : ''
      } else {
        pendingSpace += s
      }
    }
  } finally {
    // Sortie anticipée (le client a coupé) : l'appel au modèle est abandonné et son emplacement libéré
    reader.cancel().catch(() => {})
  }
}

function streamFromGenerator(gen: AsyncGenerator<Uint8Array>): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await gen.next()
        if (done) controller.close()
        else controller.enqueue(value)
      } catch (err) {
        controller.error(err)
      }
    },
    async cancel() {
      await gen.return(undefined)
    },
  })
}

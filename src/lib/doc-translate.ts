// Traduction d'un document par lots de segments, avec contrôle du nombre de séparateurs `|||`.
//
// Un modèle peut fusionner, perdre ou ajouter un `|||` : découper la réponse donne alors un nombre de morceaux
// différent du nombre de segments, et tout ce qui suit serait décalé sans que personne ne le voie. Chaque lot est
// donc vérifié ; s'il est faux on le redemande, puis on le coupe en deux jusqu'à un segment isolé (qui ne peut
// pas être mal aligné).

export const SEGMENT_SEP = '|||'

/** Caractères par lot : entrée + sortie doivent tenir dans le contexte du modèle (num_ctx 8192 par défaut). */
export const BATCH_MAX_CHARS = 3000
/** Nouvelles demandes d'un même lot avant de le couper en deux. */
export const BATCH_RETRIES = 1

/**
 * Appelle le modèle pour `count` segments déjà joints par `|||`. Le texte renvoyé est en principe joint par `|||` aussi.
 * `count` sert à le dire au modèle dans le prompt.
 */
export type TranslateBatch = (joined: string, count: number) => Promise<string>

export interface TranslateStats {
  batches: number   // appels au modèle
  retries: number   // lots redemandés à cause d'un mauvais nombre de séparateurs
  splits: number    // lots coupés en deux après les nouvelles demandes
}

/** Un `|||` dans le texte source serait pris pour un séparateur : on l'écarte. */
export function neutralizeSeparator(text: string): string {
  return text.replace(/\|{3,}/g, '| | |')
}

/** Découpe la réponse du modèle en segments ; un séparateur en tête ou en queue est ignoré. */
export function splitTranslation(output: string): string[] {
  const trimmed = output.trim().replace(/^\|\|\|\s*/, '').replace(/\s*\|\|\|$/, '')
  return trimmed.split(/\s*\|\|\|\s*/)
}

/** Regroupe des segments consécutifs en lots d'au plus `maxChars` caractères (un segment plus long forme son propre lot). */
export function splitIntoBatches(segments: string[], maxChars = BATCH_MAX_CHARS): string[][] {
  const batches: string[][] = []
  let current: string[] = []
  let size = 0
  for (const seg of segments) {
    if (current.length && size + seg.length > maxChars) {
      batches.push(current)
      current = []
      size = 0
    }
    current.push(seg)
    size += seg.length
  }
  if (current.length) batches.push(current)
  return batches
}

/**
 * Traduit une liste de segments et renvoie une liste de même longueur, dans le même ordre.
 * Les segments vides ne sont pas envoyés au modèle. Une erreur du modèle (réseau, annulation) remonte telle quelle.
 */
export async function translateSegments(
  segments: string[],
  translate: TranslateBatch,
  opts: {
    maxChars?: number
    retries?: number
    /** Lots traduits en même temps (indépendants : chacun garde sa place dans le résultat). 1 = l'un après l'autre. */
    concurrency?: number
    /** Appelé à chaque lot terminé (progression affichée à l'utilisateur) */
    onProgress?: (done: number, total: number) => void
  } = {},
): Promise<{ segments: string[]; stats: TranslateStats }> {
  const retries = opts.retries ?? BATCH_RETRIES
  const stats: TranslateStats = { batches: 0, retries: 0, splits: 0 }

  async function run(batch: string[]): Promise<string[]> {
    if (batch.length === 1) {
      stats.batches++
      // Un seul segment : aucun séparateur attendu, tout ce que renvoie le modèle est la traduction
      const out = await translate(batch[0], 1)
      return [splitTranslation(out).join(' ')]
    }
    for (let attempt = 0; attempt <= retries; attempt++) {
      stats.batches++
      const parts = splitTranslation(await translate(batch.join(` ${SEGMENT_SEP} `), batch.length))
      if (parts.length === batch.length) return parts
      if (attempt < retries) stats.retries++
    }
    stats.splits++
    const mid = Math.ceil(batch.length / 2)
    return [...await run(batch.slice(0, mid)), ...await run(batch.slice(mid))]
  }

  // Seuls les segments non vides passent par le modèle
  const positions: number[] = []
  const texts: string[] = []
  segments.forEach((s, i) => {
    if (s.trim()) { positions.push(i); texts.push(neutralizeSeparator(s)) }
  })

  const batches = splitIntoBatches(texts, opts.maxChars)
  const results: string[][] = new Array(batches.length)
  let next = 0
  let finished = 0
  let failed = false
  opts.onProgress?.(0, batches.length)
  // Quelques lots à la fois : un moteur qui sert plusieurs requêtes (vLLM, OLLAMA_NUM_PARALLEL > 1) traduit le
  // document d'autant plus vite ; sinon les requêtes attendent leur tour (limite de concurrence, file du moteur)
  const worker = async () => {
    while (!failed && next < batches.length) {
      const b = next++
      try {
        results[b] = await run(batches[b])
      } catch (err) {
        failed = true   // plus aucun nouveau lot : le document échoue de toute façon
        throw err
      }
      opts.onProgress?.(++finished, batches.length)
    }
  }
  const workers = Math.max(1, Math.min(opts.concurrency ?? 1, batches.length))
  await Promise.all(Array.from({ length: workers }, worker))

  const result = [...segments]
  const translated = results.flat()
  positions.forEach((pos, i) => { result[pos] = translated[i] })
  return { segments: result, stats }
}

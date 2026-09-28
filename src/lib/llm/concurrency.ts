import 'server-only'

// Limiteur de concurrence global devant le moteur IA, en mémoire. L'app tourne en une seule
// instance (un conteneur, cf. rate-limit.ts) : pas besoin d'un magasin partagé. `max <= 0` = illimité.

interface Waiter {
  resolve: (release: () => void) => void
  reject:  (err: unknown) => void
}

let inFlight = 0
const queue: Waiter[] = []

function release() {
  inFlight--
  const next = queue.shift()
  if (next) {
    inFlight++
    next.resolve(release)
  }
}

/** Attend un emplacement libre ; renvoie la fonction à appeler une fois la requête IA terminée. */
export function acquireAiSlot(max: number, signal?: AbortSignal): Promise<() => void> {
  if (max <= 0) return Promise.resolve(() => {})

  if (inFlight < max) {
    inFlight++
    return Promise.resolve(release)
  }

  if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'))

  return new Promise<() => void>((resolve, reject) => {
    const waiter: Waiter = { resolve, reject }
    queue.push(waiter)

    if (!signal) return
    signal.addEventListener('abort', () => {
      const idx = queue.indexOf(waiter)
      if (idx !== -1) {
        queue.splice(idx, 1)
        reject(new DOMException('Aborted', 'AbortError'))
      }
    }, { once: true })
  })
}

/** Exécute `fn` sous la limite de concurrence — pour les appels `provider.complete()`. */
export async function withAiSlot<T>(max: number, fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  const done = await acquireAiSlot(max, signal)
  try {
    return await fn()
  } finally {
    done()
  }
}

/**
 * Fait passer un flux `provider.stream()` sous la limite de concurrence.
 *
 * `stream()` d'un fournisseur (ollama-provider.ts / openai-provider.ts) fait déjà partir le `fetch`
 * dans le `start()` du `ReadableStream` qu'il construit — et `start()` s'exécute immédiatement à la
 * construction, pas à la première lecture. `makeStream` ne doit donc être appelé qu'une fois
 * l'emplacement obtenu : c'est ce flux englobant qui retarde l'appel, pas un simple passe-plat.
 */
export function gateStream(
  max: number,
  signal: AbortSignal | undefined,
  makeStream: () => ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
  let releaseSlot: (() => void) | null = null
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null

  function cleanup() {
    if (releaseSlot) { releaseSlot(); releaseSlot = null }
  }

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        releaseSlot = await acquireAiSlot(max, signal)
      } catch (err) {
        controller.error(err)
        return
      }
      reader = makeStream().getReader()
    },
    async pull(controller) {
      if (!reader) { controller.close(); cleanup(); return }
      try {
        const { done, value } = await reader.read()
        if (done) { controller.close(); cleanup(); return }
        controller.enqueue(value)
      } catch (err) {
        controller.error(err)
        cleanup()
      }
    },
    cancel(reason) {
      cleanup()
      return reader?.cancel(reason)
    },
  })
}

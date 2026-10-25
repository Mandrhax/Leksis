import 'server-only'

// Délai d'inactivité des appels au moteur IA : la requête est coupée quand plus rien n'arrive pendant
// AI_IDLE_TIMEOUT_MS (ni en-têtes ni texte), pas au bout d'une durée totale — une longue traduction qui
// avance n'est jamais interrompue, un moteur bloqué libère son emplacement (concurrency.ts) au lieu de le garder.

const DEFAULT_IDLE_SEC = 180

export function aiIdleTimeoutMs(): number {
  const sec = Number(process.env.LEKSIS_AI_IDLE_TIMEOUT_SEC)
  return (Number.isFinite(sec) && sec > 0 ? sec : DEFAULT_IDLE_SEC) * 1000
}

export class AiIdleTimeoutError extends Error {
  constructor(ms: number) {
    super(`The AI engine sent nothing for ${Math.round(ms / 1000)} s — request abandoned.`)
    this.name = 'AiIdleTimeoutError'
  }
}

/**
 * Signal coupé si `parent` l'est (le client est parti) ou si `touch()` n'a pas été appelé depuis `ms`.
 * Appeler `touch()` à chaque fragment reçu et `done()` à la fin (succès ou erreur).
 */
export function idleSignal(parent: AbortSignal | undefined, ms = aiIdleTimeoutMs()) {
  const ctrl = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const onParent = () => ctrl.abort(parent?.reason)
  if (parent?.aborted) ctrl.abort(parent.reason)
  else parent?.addEventListener('abort', onParent, { once: true })

  const touch = () => {
    clearTimeout(timer)
    timer = setTimeout(() => ctrl.abort(new AiIdleTimeoutError(ms)), ms)
  }
  const done = () => {
    clearTimeout(timer)
    parent?.removeEventListener('abort', onParent)
  }
  touch()
  return { signal: ctrl.signal, touch, done }
}

/** Texte complet d'un flux de texte brut (provider.stream) — `complete()` passe par là. */
export async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let text = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    text += decoder.decode(value, { stream: true })
  }
  return text + decoder.decode()
}

// Server-only — ne jamais importer côté client
// Port de Leksis_old/assets/js/utils.js → streamOllama()

const OLLAMA_BASE_URL     = process.env.OLLAMA_BASE_URL     || 'http://localhost:11434'
const OLLAMA_MODEL        = process.env.OLLAMA_MODEL        || 'translategemma:27b'
const OLLAMA_OCR_MODEL    = process.env.OLLAMA_OCR_MODEL    || 'maternion/LightOnOCR-2:latest'
const OLLAMA_REWRITE_MODEL = process.env.OLLAMA_REWRITE_MODEL || 'qwen2.5:14b'

export { OLLAMA_OCR_MODEL }

interface OllamaConfig {
  baseUrl:          string
  translationModel: string
  ocrModel:         string
  rewriteModel:     string
}

/**
 * Lit la configuration Ollama depuis la DB (avec fallback sur les env vars).
 * À appeler dans les routes API server-side.
 */
export async function getOllamaConfig(): Promise<OllamaConfig> {
  try {
    const { getSetting } = await import('@/lib/settings')
    const cfg = await getSetting<Record<string, string>>('ollama_config')
    return {
      baseUrl:          cfg.baseUrl          || OLLAMA_BASE_URL,
      // backward-compat: ancienne clé "model"
      translationModel: cfg.translationModel || cfg.model || OLLAMA_MODEL,
      ocrModel:         cfg.ocrModel         || OLLAMA_OCR_MODEL,
      rewriteModel:     cfg.rewriteModel     || OLLAMA_REWRITE_MODEL,
    }
  } catch {
    return {
      baseUrl:          OLLAMA_BASE_URL,
      translationModel: OLLAMA_MODEL,
      ocrModel:         OLLAMA_OCR_MODEL,
      rewriteModel:     OLLAMA_REWRITE_MODEL,
    }
  }
}

type OllamaStreamOptions = {
  prompt: string
  system?: string
  images?: string[]  // base64 pour vision
  signal?: AbortSignal
  model?: string
  baseUrl?: string
}

/**
 * Appelle Ollama /api/generate en streaming NDJSON.
 * Retourne un ReadableStream<Uint8Array> de tokens texte encodés en UTF-8.
 */
export function streamOllamaResponse({ prompt, system, images, signal, model, baseUrl }: OllamaStreamOptions): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const resolvedBaseUrl = baseUrl ?? OLLAMA_BASE_URL

  return new ReadableStream({
    async start(controller) {
      let res: Response
      try {
        res = await fetch(`${resolvedBaseUrl}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: model ?? OLLAMA_MODEL,
            prompt,
            ...(system ? { system } : {}),
            stream: true,
            keep_alive: -1,
            ...(images ? { images } : {}),
          }),
          signal,
        })
      } catch (err) {
        controller.error(err)
        return
      }

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        controller.error(new Error(`Ollama HTTP ${res.status}${text ? ': ' + text : ''}`))
        return
      }

      const reader  = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''
          for (const line of lines) {
            if (!line.trim()) continue
            try {
              const obj = JSON.parse(line) as { response?: string; done?: boolean }
              if (obj.response) {
                controller.enqueue(encoder.encode(obj.response))
              }
            } catch { /* skip malformed chunk */ }
          }
        }
      } catch (err) {
        controller.error(err)
        return
      }

      controller.close()
    },
  })
}

/**
 * Version qui accumule tout et retourne le texte complet.
 * Utile pour les routes qui ont besoin du résultat complet avant de répondre.
 */
export async function callOllama({ prompt, system, images, signal, model, baseUrl }: OllamaStreamOptions): Promise<string> {
  const resolvedBaseUrl = baseUrl ?? OLLAMA_BASE_URL
  const res = await fetch(`${resolvedBaseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model ?? OLLAMA_MODEL,
      prompt,
      ...(system ? { system } : {}),
      stream: false,
      keep_alive: -1,
      ...(images ? { images } : {}),
    }),
    signal,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Ollama HTTP ${res.status}${text ? ': ' + text : ''}`)
  }

  const data = await res.json() as { response: string }
  return data.response
}

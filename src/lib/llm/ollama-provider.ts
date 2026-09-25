import 'server-only'
import { DEFAULT_NUM_CTX, type LlmModel, type LlmProvider, type LlmRequest } from './types'

/**
 * Fournisseur Ollama — API native /api/generate (NDJSON).
 * Le serveur applique lui-même le template du modèle (system + prompt).
 */
export function createOllamaProvider(baseUrl: string, numCtx = DEFAULT_NUM_CTX): LlmProvider {
  const base = baseUrl.replace(/\/+$/, '')

  function payload(req: LlmRequest, stream: boolean): string {
    return JSON.stringify({
      model: req.model,
      prompt: req.prompt,
      ...(req.system ? { system: req.system } : {}),
      stream,
      // Sans num_ctx, Ollama applique son contexte par défaut (petit) et tronque les longs textes en silence
      options: { num_ctx: numCtx },
      ...(req.images?.length ? { images: req.images } : {}),
    })
  }

  return {
    id: 'ollama',
    capabilities: { pull: true, delete: true, warmup: true, unload: true, running: true },

    stream(req) {
      const encoder = new TextEncoder()
      return new ReadableStream<Uint8Array>({
        async start(controller) {
          let res: Response
          try {
            res = await fetch(`${base}/api/generate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: payload(req, true),
              signal: req.signal,
            })
          } catch (err) {
            controller.error(err)
            return
          }

          if (!res.ok || !res.body) {
            const text = await res.text().catch(() => '')
            controller.error(new Error(`Ollama HTTP ${res.status}${text ? ': ' + text : ''}`))
            return
          }

          const reader  = res.body.getReader()
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
                let obj: { response?: string; error?: string }
                try { obj = JSON.parse(line) } catch { continue } // chunk malformé : ignoré
                if (obj.error) {
                  controller.error(new Error(`Ollama: ${obj.error}`))
                  reader.cancel().catch(() => {})
                  return
                }
                if (obj.response) controller.enqueue(encoder.encode(obj.response))
              }
            }
          } catch (err) {
            controller.error(err)
            return
          }

          controller.close()
        },
      })
    },

    async complete(req) {
      const res = await fetch(`${base}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload(req, false),
        signal: req.signal,
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`Ollama HTTP ${res.status}${text ? ': ' + text : ''}`)
      }
      const data = await res.json() as { response?: string }
      return data.response ?? ''
    },

    async listModels(signal) {
      const res = await fetch(`${base}/api/tags`, { signal: signal ?? AbortSignal.timeout(8000) })
      if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`)
      const json = await res.json() as { models?: { name?: string; size?: number; modified_at?: string }[] }
      return (json.models ?? [])
        .filter(m => m.name)
        .map((m): LlmModel => ({ name: m.name as string, size: m.size ?? 0, modifiedAt: m.modified_at ?? '' }))
    },
  }
}

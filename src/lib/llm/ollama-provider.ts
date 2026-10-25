import 'server-only'
import { DEFAULT_NUM_CTX, type LlmModel, type LlmProvider, type LlmRequest } from './types'
import { idleSignal, readAll } from './idle-timeout'

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
    capabilities: { pull: true, delete: true, warmup: true, unload: true, running: true, transcribe: false },

    stream(req) {
      const encoder = new TextEncoder()
      return new ReadableStream<Uint8Array>({
        async start(controller) {
          // Coupé si Ollama n'envoie plus rien (idle-timeout.ts), ou si le client part (req.signal)
          const idle = idleSignal(req.signal)
          let res: Response
          try {
            res = await fetch(`${base}/api/generate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: payload(req, true),
              signal: idle.signal,
            })
          } catch (err) {
            idle.done()
            controller.error(err)
            return
          }

          if (!res.ok || !res.body) {
            idle.done()
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
              idle.touch()
              buffer += decoder.decode(value, { stream: true })
              const lines = buffer.split('\n')
              buffer = lines.pop() ?? ''
              for (const line of lines) {
                if (!line.trim()) continue
                let obj: { response?: string; error?: string }
                try { obj = JSON.parse(line) } catch { continue } // chunk malformé : ignoré
                if (obj.error) {
                  idle.done()
                  controller.error(new Error(`Ollama: ${obj.error}`))
                  reader.cancel().catch(() => {})
                  return
                }
                if (obj.response) controller.enqueue(encoder.encode(obj.response))
              }
            }
          } catch (err) {
            idle.done()
            controller.error(err)
            return
          }

          idle.done()
          controller.close()
        },
      })
    },

    // En flux, pas `stream: false` : sans flux, Ollama n'envoie les en-têtes qu'à la fin de la génération, et Node
    // abandonne au bout de 300 s sans en-têtes (« fetch failed ») — un lot de document ou une page scannée lente échouait.
    complete(req) {
      return readAll(this.stream(req))
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

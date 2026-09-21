import 'server-only'
import type { LlmModel, LlmProvider, LlmRequest } from './types'

/**
 * Base de l'API OpenAI-compatible : « http://host:8000 » devient « http://host:8000/v1 » ;
 * un chemin explicite (« https://openrouter.ai/api/v1 ») est conservé tel quel.
 */
export function normalizeOpenAiBase(baseUrl: string): string {
  let url: URL
  try {
    url = new URL(baseUrl)
  } catch {
    return baseUrl.replace(/\/+$/, '')
  }
  const path = url.pathname.replace(/\/+$/, '')
  url.pathname = path === '' ? '/v1' : path
  url.search = ''
  url.hash = ''
  return url.toString().replace(/\/+$/, '')
}

function imageMime(b64: string): string {
  if (b64.startsWith('/9j/'))   return 'image/jpeg'
  if (b64.startsWith('iVBOR'))  return 'image/png'
  if (b64.startsWith('R0lGOD')) return 'image/gif'
  if (b64.startsWith('UklGR'))  return 'image/webp'
  return 'image/png'
}

type ChatMessage = { role: 'system' | 'user'; content: string | unknown[] }

function buildMessages(req: LlmRequest): ChatMessage[] {
  const messages: ChatMessage[] = []
  if (req.system) messages.push({ role: 'system', content: req.system })
  if (req.images?.length) {
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: req.prompt },
        ...req.images.map(b64 => ({
          type: 'image_url',
          image_url: { url: `data:${imageMime(b64)};base64,${b64}` },
        })),
      ],
    })
  } else {
    messages.push({ role: 'user', content: req.prompt })
  }
  return messages
}

async function httpError(res: Response): Promise<Error> {
  const text = await res.text().catch(() => '')
  let detail = text
  try {
    const json = JSON.parse(text) as { error?: { message?: string } | string; message?: string }
    detail = (typeof json.error === 'string' ? json.error : json.error?.message) ?? json.message ?? text
  } catch { /* corps non JSON : texte brut */ }
  return new Error(`AI server HTTP ${res.status}${detail ? ': ' + detail.slice(0, 500) : ''}`)
}

interface ChatChunk {
  choices?: { delta?: { content?: string | null }; text?: string }[]
  error?: { message?: string }
}

/**
 * Fournisseur OpenAI-compatible (vLLM, LM Studio, llama.cpp, LocalAI, OpenRouter, OpenAI…)
 * via /v1/chat/completions (flux SSE) et /v1/models.
 */
export function createOpenAiProvider(baseUrl: string, apiKey = ''): LlmProvider {
  const base = normalizeOpenAiBase(baseUrl)

  function headers(json = true): Record<string, string> {
    return {
      ...(json ? { 'Content-Type': 'application/json' } : {}),
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    }
  }

  return {
    id: 'openai',
    capabilities: { pull: false, delete: false, warmup: false, unload: false, running: false },

    stream(req) {
      const encoder = new TextEncoder()
      return new ReadableStream<Uint8Array>({
        async start(controller) {
          let res: Response
          try {
            res = await fetch(`${base}/chat/completions`, {
              method: 'POST',
              headers: headers(),
              body: JSON.stringify({ model: req.model, messages: buildMessages(req), stream: true }),
              signal: req.signal,
            })
          } catch (err) {
            controller.error(err)
            return
          }

          if (!res.ok || !res.body) {
            controller.error(await httpError(res))
            return
          }

          const reader  = res.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ''

          // Renvoie false si le serveur a signalé une erreur dans le flux
          function handleLine(raw: string): boolean {
            const line = raw.trim()
            if (!line.startsWith('data:')) return true
            const data = line.slice(5).trim()
            if (!data || data === '[DONE]') return true
            try {
              const obj = JSON.parse(data) as ChatChunk
              if (obj.error?.message) {
                controller.error(new Error(obj.error.message))
                return false
              }
              const piece = obj.choices?.[0]?.delta?.content ?? obj.choices?.[0]?.text
              if (piece) controller.enqueue(encoder.encode(piece))
            } catch { /* chunk malformé : ignoré */ }
            return true
          }

          try {
            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              buffer += decoder.decode(value, { stream: true })
              const lines = buffer.split('\n')
              buffer = lines.pop() ?? ''
              for (const line of lines) {
                if (!handleLine(line)) return
              }
            }
            if (buffer && !handleLine(buffer)) return
          } catch (err) {
            controller.error(err)
            return
          }

          controller.close()
        },
      })
    },

    async complete(req) {
      const res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ model: req.model, messages: buildMessages(req), stream: false }),
        signal: req.signal,
      })
      if (!res.ok) throw await httpError(res)
      const data = await res.json() as { choices?: { message?: { content?: string | null }; text?: string }[] }
      return data.choices?.[0]?.message?.content ?? data.choices?.[0]?.text ?? ''
    },

    async listModels(signal) {
      const res = await fetch(`${base}/models`, { headers: headers(false), signal: signal ?? AbortSignal.timeout(8000) })
      if (!res.ok) throw await httpError(res)
      const json = await res.json() as { data?: { id?: string; created?: number }[] }
      return (json.data ?? [])
        .filter(m => m.id)
        .map((m): LlmModel => ({
          name: m.id as string,
          size: 0,
          modifiedAt: m.created ? new Date(m.created * 1000).toISOString() : '',
        }))
    },
  }
}

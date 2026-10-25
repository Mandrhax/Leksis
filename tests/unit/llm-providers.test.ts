import { afterEach, describe, expect, it, vi } from 'vitest'
import { createOllamaProvider } from '@/lib/llm/ollama-provider'
import { createOpenAiProvider } from '@/lib/llm/openai-provider'
import { readAll } from '@/lib/llm/idle-timeout'

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.LEKSIS_AI_IDLE_TIMEOUT_SEC
})

/** Réponse en flux : chaque morceau est envoyé tel quel (les coupures tombent au milieu des lignes exprès). */
function streamingFetch(chunks: string[]) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(new ReadableStream<Uint8Array>({
    start(c) {
      for (const chunk of chunks) c.enqueue(new TextEncoder().encode(chunk))
      c.close()
    },
  })))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

/** Serveur qui accepte la requête puis ne répond plus jamais (sauf annulation). */
function hangingFetch() {
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => new Response(new ReadableStream<Uint8Array>({
    start(c) { init?.signal?.addEventListener('abort', () => c.error(init.signal?.reason)) },
  }))))
}

describe('Ollama provider', () => {
  it('turns the NDJSON stream into plain text, lines split across chunks included', async () => {
    streamingFetch(['{"response":"Bon', 'jour"}\n{"respo', 'nse":" le monde"}\n', '{"response":"","done":true}\n'])
    const text = await readAll(createOllamaProvider('http://ollama:11434').stream({ prompt: 'p', model: 'm' }))
    expect(text).toBe('Bonjour le monde')
  })

  it('complete() asks for a stream (no 300 s wait for headers) and returns the whole text', async () => {
    const fetchMock = streamingFetch(['{"response":"A"}\n{"response":"B"}\n'])
    expect(await createOllamaProvider('http://ollama:11434').complete({ prompt: 'p', model: 'm' })).toBe('AB')
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.stream).toBe(true)
    expect(body.options.num_ctx).toBeGreaterThan(0)
  })

  it('reports an error sent inside the stream', async () => {
    streamingFetch(['{"response":"A"}\n{"error":"model not found"}\n'])
    await expect(createOllamaProvider('http://ollama:11434').complete({ prompt: 'p', model: 'm' })).rejects.toThrow('model not found')
  })

  it('abandons a request when the engine stops sending anything', async () => {
    process.env.LEKSIS_AI_IDLE_TIMEOUT_SEC = '0.05'
    hangingFetch()
    await expect(createOllamaProvider('http://ollama:11434').complete({ prompt: 'p', model: 'm' })).rejects.toThrow(/sent nothing/)
  })
})

describe('OpenAI-compatible provider', () => {
  it('turns the SSE stream into plain text and ignores [DONE]', async () => {
    streamingFetch(['data: {"choices":[{"delta":{"content":"Hel"}}]}\n\nda', 'ta: {"choices":[{"delta":{"content":"lo"}}]}\n\ndata: [DONE]\n\n'])
    expect(await createOpenAiProvider('http://vllm:8000').complete({ prompt: 'p', model: 'm' })).toBe('Hello')
  })

  it('abandons a request when the server stops sending anything', async () => {
    process.env.LEKSIS_AI_IDLE_TIMEOUT_SEC = '0.05'
    hangingFetch()
    await expect(createOpenAiProvider('http://vllm:8000').complete({ prompt: 'p', model: 'm' })).rejects.toThrow(/sent nothing/)
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createOpenAiProvider } from '@/lib/llm/openai-provider'

afterEach(() => { vi.unstubAllGlobals() })

function stubFetchOnce(responseBody: unknown) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(responseBody), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('createOpenAiProvider : audio en entrée', () => {
  it('ajoute un bloc input_audio quand `audio` est fourni, avec le format dérivé du MIME', async () => {
    const fetchMock = stubFetchOnce({ choices: [{ message: { content: 'hello world' } }] })
    const provider = createOpenAiProvider('http://host:8000', '')

    const result = await provider.complete({
      prompt: 'Transcribe this.',
      audio: 'BASE64AUDIODATA',
      audioMimeType: 'audio/webm;codecs=opus',
      model: 'apertus',
    })

    expect(result).toBe('hello world')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string)
    const userMessage = body.messages.find((m: { role: string }) => m.role === 'user')
    const audioBlock = userMessage.content.find((c: { type: string }) => c.type === 'input_audio')
    expect(audioBlock).toEqual({ type: 'input_audio', input_audio: { data: 'BASE64AUDIODATA', format: 'webm' } })
  })

  it('n\'ajoute pas de bloc audio quand aucun clip n\'est fourni (texte simple)', async () => {
    const fetchMock = stubFetchOnce({ choices: [{ message: { content: 'ok' } }] })
    const provider = createOpenAiProvider('http://host:8000', '')

    await provider.complete({ prompt: 'Just text.', model: 'apertus' })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string)
    expect(body.messages).toEqual([{ role: 'user', content: 'Just text.' }])
  })
})

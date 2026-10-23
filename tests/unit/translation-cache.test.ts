import { describe, expect, it, vi } from 'vitest'
import { TranslationCache, collectOnComplete, streamOfText } from '@/lib/translation-cache'

const LIMITS = { ttlMinutes: 30, maxEntries: 3 }

function clock(start = 0) {
  const c = { t: start, now: () => c.t }
  return c
}

async function drain(s: ReadableStream<Uint8Array>) {
  const r = s.getReader()
  const dec = new TextDecoder()
  let out = ''
  while (true) {
    const { done, value } = await r.read()
    if (done) return out
    out += dec.decode(value, { stream: true })
  }
}

describe('TranslationCache', () => {
  it('returns a translation stored for the same user, model and prompt', () => {
    const cache = new TranslationCache()
    const key = TranslationCache.key('u1', 'translategemma:12b', 'prompt')
    expect(cache.get(key)).toBeUndefined()
    cache.set(key, 'Hallo', LIMITS)
    expect(cache.get(TranslationCache.key('u1', 'translategemma:12b', 'prompt'))).toBe('Hallo')
  })

  it('keeps users apart, and a change of model or prompt misses', () => {
    const cache = new TranslationCache()
    cache.set(TranslationCache.key('u1', 'm', 'p'), 'Hallo', LIMITS)
    expect(cache.get(TranslationCache.key('u2', 'm', 'p'))).toBeUndefined()
    expect(cache.get(TranslationCache.key('u1', 'm2', 'p'))).toBeUndefined()
    expect(cache.get(TranslationCache.key('u1', 'm', 'p (Formal)'))).toBeUndefined()
  })

  it('forgets an entry after its time to live', () => {
    const c = clock()
    const cache = new TranslationCache(c.now)
    cache.set('k', 'Hallo', LIMITS)
    c.t += 29 * 60_000
    expect(cache.get('k')).toBe('Hallo')
    c.t += 60_000
    expect(cache.get('k')).toBeUndefined()
    expect(cache.size).toBe(0)
  })

  it('evicts the least recently used entry beyond maxEntries', () => {
    const cache = new TranslationCache()
    cache.set('a', '1', LIMITS)
    cache.set('b', '2', LIMITS)
    cache.set('c', '3', LIMITS)
    cache.get('a') // a becomes the most recent
    cache.set('d', '4', LIMITS)
    expect(cache.get('b')).toBeUndefined()
    expect([cache.get('a'), cache.get('c'), cache.get('d')]).toEqual(['1', '3', '4'])
    // A smaller maximum set in the admin applies at the next write
    cache.set('e', '5', { ...LIMITS, maxEntries: 1 })
    expect(cache.size).toBe(1)
    expect(cache.get('e')).toBe('5')
  })

  it('a time to live or size of 0 disables the cache and empties it', () => {
    const cache = new TranslationCache()
    cache.set('a', '1', LIMITS)
    cache.set('b', '2', { ttlMinutes: 0, maxEntries: 3 })
    expect(cache.size).toBe(0)
    cache.set('c', '3', { ttlMinutes: 30, maxEntries: 0 })
    expect(cache.size).toBe(0)
  })
})

describe('collectOnComplete', () => {
  it('passes the stream through and reports the full text at the end', async () => {
    const done = vi.fn()
    const src = new ReadableStream<Uint8Array>({
      start(c) { for (const s of ['Ha', 'llo ', 'zäme']) c.enqueue(new TextEncoder().encode(s)); c.close() },
    })
    expect(await drain(collectOnComplete(src, done))).toBe('Hallo zäme')
    expect(done).toHaveBeenCalledWith('Hallo zäme')
  })

  it('never reports a cut-off answer (cancel or engine error)', async () => {
    const done = vi.fn()
    const endless = new ReadableStream<Uint8Array>({ pull(c) { c.enqueue(new TextEncoder().encode('x')) } })
    const reader = collectOnComplete(endless, done).getReader()
    await reader.read()
    await reader.cancel()
    const failing = new ReadableStream<Uint8Array>({
      start(c) { c.enqueue(new TextEncoder().encode('part')); c.error(new Error('Ollama HTTP 500')) },
    })
    await expect(drain(collectOnComplete(failing, done))).rejects.toThrow()
    expect(done).not.toHaveBeenCalled()
  })

  it('streamOfText replays a cached translation', async () => {
    expect(await drain(streamOfText('Grüezi'))).toBe('Grüezi')
  })
})

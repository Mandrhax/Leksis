import { describe, expect, it } from 'vitest'
import { splitParagraphs, joinParagraphs } from '@/lib/text-segments'
import { TranslationCache } from '@/lib/translation-cache'
import { translateIncremental, type IncrementalOptions } from '@/lib/translate-incremental'
import type { UsageEntry } from '@/lib/usage'

const LIMITS = { ttlMinutes: 30, maxEntries: 1000 }

const FIVE = [
  'Premier paragraphe, qui présente le sujet.',
  'Deuxième paragraphe, avec des détails.',
  'Troisième paragraphe, au milieu.',
  'Quatrième paragraphe, presque la fin.',
  'Cinquième paragraphe, la conclusion.',
].join('\n\n')

/** Fake model: "translates" every paragraph to DE(<paragraph>), keeping the blank lines; records each prompt */
function fakeModel(opts: { mergeParagraphs?: boolean; chunk?: number } = {}) {
  const prompts: { text: string; context?: string }[] = []
  const stream = (prompt: string) => {
    const p = JSON.parse(prompt) as { text: string; context?: string }
    prompts.push(p)
    const { parts, separators } = splitParagraphs(p.text)
    const out = opts.mergeParagraphs
      ? parts.map(x => `DE(${x})`).join(' ')
      : '\n' + joinParagraphs(parts.map(x => `DE(${x})`), separators) + '\n' // models often add newlines
    const size = opts.chunk ?? 7
    let i = 0
    return new ReadableStream<Uint8Array>({
      pull(c) {
        if (i >= out.length) { c.close(); return }
        c.enqueue(new TextEncoder().encode(out.slice(i, i + size)))
        i += size
      },
    })
  }
  return { prompts, stream }
}

function run(text: string, model: ReturnType<typeof fakeModel>, cache: TranslationCache, over: Partial<IncrementalOptions> = {}) {
  const usage: UsageEntry = { userEmail: 'u@x.ch', feature: 'text', charCount: text.length }
  const stream = translateIncremental({
    text, userId: 'u1', model: 'translategemma:12b',
    buildPrompt: (t, context) => JSON.stringify({ text: t, context }),
    stream: model.stream, cache, limits: LIMITS, incremental: true, segmentContext: true, usage,
    ...over,
  })
  return { usage, output: drain(stream) }
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

describe('splitParagraphs / joinParagraphs', () => {
  it('splits on blank lines and gives the same text back', () => {
    const text = 'Un.\nDeux, même paragraphe.\n\nTrois.\n \n\n\tQuatre.'
    const { parts, separators } = splitParagraphs(text)
    expect(parts).toEqual(['Un.\nDeux, même paragraphe.', 'Trois.', 'Quatre.'])
    expect(joinParagraphs(parts, separators)).toBe(text)
  })

  it('handles Windows line breaks, a single paragraph and an empty text', () => {
    expect(splitParagraphs('A\r\n\r\nB').parts).toEqual(['A', 'B'])
    expect(splitParagraphs('  seul  ').parts).toEqual(['seul'])
    expect(splitParagraphs('   ').parts).toEqual([])
  })
})

describe('translateIncremental', () => {
  it('first translation: one call on the whole text, as before', async () => {
    const model = fakeModel()
    const { output, usage } = run(FIVE, model, new TranslationCache())
    expect(await output).toContain('DE(Premier paragraphe')
    expect(model.prompts).toHaveLength(1)
    expect(model.prompts[0].text).toBe(FIVE)
    expect(usage.modelChars).toBe(FIVE.length)
  })

  it('5 paragraphs, one modified ⇒ exactly one call, for that paragraph, with the previous one as context', async () => {
    const model = fakeModel()
    const cache = new TranslationCache()
    await run(FIVE, model, cache).output

    const edited = FIVE.replace('Troisième paragraphe, au milieu.', 'Troisième paragraphe, au milieu, modifié.')
    const { output, usage } = run(edited, model, cache)
    const text = await output

    expect(model.prompts).toHaveLength(2)
    expect(model.prompts[1]).toEqual({ text: 'Troisième paragraphe, au milieu, modifié.', context: 'Deuxième paragraphe, avec des détails.' })
    expect(text).toBe(joinParagraphs(splitParagraphs(edited).parts.map(p => `DE(${p})`), splitParagraphs(edited).separators))
    expect(usage.modelChars).toBe('Troisième paragraphe, au milieu, modifié.'.length + 'Deuxième paragraphe, avec des détails.'.length)
    expect(usage.modelChars!).toBeLessThan(edited.length)
  })

  it('typing a new last paragraph only sends that paragraph', async () => {
    const model = fakeModel()
    const cache = new TranslationCache()
    await run(FIVE, model, cache).output
    await run(FIVE + '\n\nSixième.', model, cache).output
    await run(FIVE + '\n\nSixième, plus long.', model, cache).output
    expect(model.prompts.slice(1).map(p => p.text)).toEqual(['Sixième.', 'Sixième, plus long.'])
  })

  it('without segmentContext, the changed paragraph is sent alone', async () => {
    const model = fakeModel()
    const cache = new TranslationCache()
    await run(FIVE, model, cache, { segmentContext: false }).output
    await run(FIVE.replace('au milieu', 'au centre'), model, cache, { segmentContext: false }).output
    expect(model.prompts[1].context).toBeUndefined()
  })

  it('more than half of the paragraphs changed ⇒ one call on the whole text', async () => {
    const model = fakeModel()
    const cache = new TranslationCache()
    await run(FIVE, model, cache).output
    const rewritten = FIVE.replace('Premier', 'First').replace('Deuxième', 'Second').replace('Troisième', 'Third')
    await run(rewritten, model, cache).output
    expect(model.prompts).toHaveLength(2)
    expect(model.prompts[1].text).toBe(rewritten)
  })

  it('the same text again is a cache hit, without any call', async () => {
    const model = fakeModel()
    const cache = new TranslationCache()
    const first = await run(FIVE, model, cache).output
    const again = run(FIVE, model, cache)
    expect(await again.output).toBe(first)
    expect(again.usage).toMatchObject({ status: 'cache_hit', modelChars: 0 })
    expect(model.prompts).toHaveLength(1)
  })

  it('going back to an earlier version is served from the paragraph cache', async () => {
    const model = fakeModel()
    const cache = new TranslationCache()
    await run(FIVE, model, cache).output
    await run(FIVE.replace('au milieu', 'au centre'), model, cache).output
    const back = run(FIVE.replace('au milieu', 'au centre').replace('au centre', 'au milieu'), model, cache)
    await back.output
    expect(back.usage.status).toBe('cache_hit')
    expect(model.prompts).toHaveLength(2)
  })

  it('a model that merges paragraphs: no per-paragraph cache, the next edit re-sends the whole text', async () => {
    const model = fakeModel({ mergeParagraphs: true })
    const cache = new TranslationCache()
    await run(FIVE, model, cache).output
    await run(FIVE.replace('au milieu', 'au centre'), model, cache).output
    expect(model.prompts).toHaveLength(2)
    expect(model.prompts[1].text).toBe(FIVE.replace('au milieu', 'au centre'))
  })

  it('a disabled cache (TTL 0) never skips the model', async () => {
    const model = fakeModel()
    const cache = new TranslationCache()
    const off = { limits: { ttlMinutes: 0, maxEntries: 1000 } }
    await run(FIVE, model, cache, off).output
    await run(FIVE, model, cache, off).output
    expect(model.prompts).toHaveLength(2)
  })

  it('markdown mode (Extract & translate) never splits the text', async () => {
    const model = fakeModel()
    const cache = new TranslationCache()
    await run(FIVE, model, cache, { incremental: false }).output
    await run(FIVE.replace('au milieu', 'au centre'), model, cache, { incremental: false }).output
    expect(model.prompts.map(p => p.text)).toEqual([FIVE, FIVE.replace('au milieu', 'au centre')])
  })

  it('users do not share cached paragraphs', async () => {
    const model = fakeModel()
    const cache = new TranslationCache()
    await run(FIVE, model, cache).output
    await run(FIVE, model, cache, { userId: 'u2' }).output
    expect(model.prompts).toHaveLength(2)
  })

  it('a cancelled incremental answer is not cached', async () => {
    const model = fakeModel({ chunk: 3 })
    const cache = new TranslationCache()
    await run(FIVE, model, cache).output
    const edited = FIVE.replace('au milieu', 'au centre')
    const usage: UsageEntry = { userEmail: 'u@x.ch', feature: 'text' }
    const reader = translateIncremental({
      text: edited, userId: 'u1', model: 'translategemma:12b',
      buildPrompt: (t, context) => JSON.stringify({ text: t, context }),
      stream: model.stream, cache, limits: LIMITS, incremental: true, segmentContext: true, usage,
    }).getReader()
    for (let i = 0; i < 5; i++) await reader.read()
    await reader.cancel()
    await run(edited, model, cache).output
    expect(model.prompts.filter(p => p.text.includes('au centre'))).toHaveLength(2)
  })
})

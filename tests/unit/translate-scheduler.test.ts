import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TranslationScheduler, normalizeForCompare, type SkipReason, type TranslationBody, type TranslationInput } from '@/lib/translate-scheduler'
import { sameBaseLanguage } from '@/lib/languages'

const CONFIG = { debounceMs: 1000, minChars: 3, autoDetectMinChars: 20 }

function input(text: string, over: Partial<TranslationInput> = {}): TranslationInput {
  return {
    text, sourceCode: 'fr', sourceName: 'French', targetCode: 'de-CH', targetName: 'German (Switzerland)',
    formality: null, autoDetect: false, ...over,
  }
}

/**
 * Fake /api/translate: each call is recorded and stays open until the test resolves it,
 * so cancellation and late answers can be played in any order.
 */
function fakeServer() {
  const calls: { body: TranslationBody; signal: AbortSignal; push: (s: string) => void; end: () => void }[] = []
  const translate = (body: TranslationBody, signal: AbortSignal): AsyncIterable<string> => {
    const queue: (string | null)[] = []
    let wake: (() => void) | null = null
    const notify = () => { wake?.(); wake = null }
    calls.push({ body, signal, push: s => { queue.push(s); notify() }, end: () => { queue.push(null); notify() } })
    return {
      async *[Symbol.asyncIterator]() {
        while (true) {
          if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
          if (!queue.length) {
            await new Promise<void>(r => { wake = r; signal.addEventListener('abort', () => r(), { once: true }) })
            continue
          }
          const next = queue.shift()!
          if (next === null) return
          yield next
        }
      },
    }
  }
  return { calls, translate }
}

function setup() {
  const server = fakeServer()
  const state = { output: '', loading: false, error: '', stale: false, skips: [] as (SkipReason | null)[] }
  const scheduler = new TranslationScheduler(CONFIG, server.translate, {
    onLoading: l => { state.loading = l },
    onOutput:  o => { state.output = o },
    onError:   e => { state.error = e },
    onStale:   s => { state.stale = s },
    onSkip:    r => { state.skips.push(r) },
  })
  return { scheduler, server, state }
}

const flush = () => vi.advanceTimersByTimeAsync(0)

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('debounce', () => {
  it('typing sends one request, after a pause of debounceMs, with the last text', async () => {
    const { scheduler, server } = setup()
    for (const text of ['Bon', 'Bonjour', 'Bonjour à', 'Bonjour à tous']) {
      scheduler.request(() => input(text), 'typing')
      await vi.advanceTimersByTimeAsync(300)
    }
    expect(server.calls).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(CONFIG.debounceMs)
    expect(server.calls).toHaveLength(1)
    expect(server.calls[0].body).toMatchObject({ text: 'Bonjour à tous', trigger: 'typing' })
  })

  it('reads the state when it leaves, not when the key was pressed', async () => {
    const { scheduler, server } = setup()
    let text = 'Bonjour'
    scheduler.request(() => input(text), 'auto_detect')
    text = 'Bonjour le monde'
    await vi.advanceTimersByTimeAsync(CONFIG.debounceMs)
    expect(server.calls[0].body.text).toBe('Bonjour le monde')
  })

  it.each(['paste', 'button', 'lang_change'] as const)('%s sends at once', async trigger => {
    const { scheduler, server } = setup()
    scheduler.request(() => input('Bonjour à tous'), trigger)
    await flush()
    expect(server.calls).toHaveLength(1)
    expect(server.calls[0].body.trigger).toBe(trigger)
  })

  it('an immediate trigger replaces a pending debounce', async () => {
    const { scheduler, server } = setup()
    scheduler.request(() => input('Bonjour'), 'typing')
    scheduler.request(() => input('Bonjour à tous'), 'button')
    await vi.advanceTimersByTimeAsync(CONFIG.debounceMs * 2)
    expect(server.calls.map(c => c.body.text)).toEqual(['Bonjour à tous'])
  })

  it('follows a new debounce value', async () => {
    const { scheduler, server } = setup()
    scheduler.setConfig({ ...CONFIG, debounceMs: 2000 })
    scheduler.request(() => input('Bonjour à tous'), 'typing')
    await vi.advanceTimersByTimeAsync(1500)
    expect(server.calls).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(500)
    expect(server.calls).toHaveLength(1)
  })
})

describe('request group', () => {
  it('keeps one id for a typing session and changes it on a new input', async () => {
    const { scheduler, server } = setup()
    scheduler.request(() => input('Bonjour à tous'), 'button')
    await flush()
    scheduler.request(() => input('Bonjour à toutes'), 'button')
    await flush()
    scheduler.newGroup()
    scheduler.request(() => input('Autre texte'), 'paste')
    await flush()
    const ids = server.calls.map(c => c.body.requestGroupId)
    expect(ids[0]).toBe(ids[1])
    expect(ids[2]).not.toBe(ids[1])
    expect(ids[0]).toMatch(/^[0-9a-f]{32}$/)
  })
})

describe('cancellation', () => {
  it('a new request aborts the one in flight', async () => {
    const { scheduler, server } = setup()
    scheduler.request(() => input('Bonjour'), 'button')
    await flush()
    scheduler.request(() => input('Bonjour à tous'), 'button')
    await flush()
    expect(server.calls).toHaveLength(2)
    expect(server.calls[0].signal.aborted).toBe(true)
    expect(server.calls[1].signal.aborted).toBe(false)
  })

  it('cancel() stops the pending debounce and the request in flight', async () => {
    const { scheduler, server, state } = setup()
    scheduler.request(() => input('Bonjour à tous'), 'button')
    await flush()
    scheduler.request(() => input('Bonjour à toutes'), 'typing')
    scheduler.cancel()
    await vi.advanceTimersByTimeAsync(CONFIG.debounceMs * 2)
    expect(server.calls).toHaveLength(1)
    expect(server.calls[0].signal.aborted).toBe(true)
    expect(state.loading).toBe(false)
  })

  it('ignores an answer for a text that is no longer the current one', async () => {
    const { scheduler, server, state } = setup()
    // A translate function that does not stop on abort (answer already on its way)
    const late: { push?: (s: string) => void } = {}
    const deaf = new TranslationScheduler(CONFIG, () => ({
      async *[Symbol.asyncIterator]() {
        const chunk = await new Promise<string>(r => { late.push = r })
        yield chunk
      },
    }), { onLoading: () => {}, onOutput: o => { state.output = o }, onError: () => {}, onStale: () => {}, onSkip: () => {} })
    deaf.request(() => input('Bonjour'), 'button')
    await flush()
    deaf.cancel()
    late.push!('Hallo (old)')
    await flush()
    expect(state.output).toBe('')

    // Same with two requests: only the second one is displayed, whatever the arrival order
    scheduler.request(() => input('Bonjour'), 'button')
    await flush()
    const first = server.calls[0]
    scheduler.request(() => input('Bonjour à tous'), 'button')
    await flush()
    server.calls[1].push('Hallo zäme')
    first.push('Hallo')
    await flush()
    expect(state.output).toBe('Hallo zäme')
  })

  it('keeps the previous translation, marked stale, until the first chunk of the new one', async () => {
    const { scheduler, server, state } = setup()
    scheduler.request(() => input('Bonjour'), 'button')
    await flush()
    server.calls[0].push('Hallo')
    server.calls[0].end()
    await flush()
    expect(state).toMatchObject({ output: 'Hallo', stale: false, loading: false })

    scheduler.request(() => input('Bonjour à tous'), 'button')
    await flush()
    expect(state).toMatchObject({ output: 'Hallo', stale: true, loading: true })
    server.calls[1].push('Hallo zäme')
    await flush()
    expect(state).toMatchObject({ output: 'Hallo zäme', stale: false })
  })

  it('an error of a replaced request is not shown', async () => {
    const state = { error: '' }
    const failing = new TranslationScheduler(CONFIG, () => ({
      async *[Symbol.asyncIterator]() { await new Promise(r => setTimeout(r, 10)); throw new Error('HTTP 502') },
    }), { onLoading: () => {}, onOutput: () => {}, onError: e => { state.error = e }, onStale: () => {}, onSkip: () => {} })
    failing.request(() => input('Bonjour'), 'button')
    failing.cancel()
    await vi.advanceTimersByTimeAsync(20)
    expect(state.error).toBe('')
  })

  it('streams the output and clears the loading state at the end', async () => {
    const { scheduler, server, state } = setup()
    scheduler.request(() => input('Bonjour à tous'), 'button')
    await flush()
    expect(state.loading).toBe(true)
    server.calls[0].push('Hallo ')
    server.calls[0].push('zäme')
    await flush()
    expect(state.output).toBe('Hallo zäme')
    server.calls[0].end()
    await flush()
    expect(state.loading).toBe(false)
  })
})

describe('nothing useless is sent', () => {
  async function translated(s: ReturnType<typeof setup>, text: string, over: Partial<TranslationInput> = {}) {
    s.scheduler.request(() => input(text, over), 'button')
    await flush()
    const call = s.server.calls.at(-1)!
    call.push(`DE(${text})`)
    call.end()
    await flush()
  }

  it('skips a text identical to the one displayed, spaces aside', async () => {
    const s = setup()
    await translated(s, 'Bonjour à tous.\n\nMerci.')
    s.scheduler.request(() => input('  Bonjour   à tous. \n\n\n Merci.  '), 'typing')
    await vi.advanceTimersByTimeAsync(CONFIG.debounceMs)
    s.scheduler.request(() => input('Bonjour à tous.\n\nMerci.'), 'button')
    await flush()
    expect(s.server.calls).toHaveLength(1)
    expect(s.state.skips.at(-1)).toBe('identical')
    expect(s.state.output).toBe('DE(Bonjour à tous.\n\nMerci.)')
  })

  it('skips a request identical to the one in flight', async () => {
    const s = setup()
    s.scheduler.request(() => input('Bonjour à tous'), 'paste')
    await flush()
    s.scheduler.request(() => input('Bonjour à tous'), 'button')
    await flush()
    expect(s.server.calls).toHaveLength(1)
    expect(s.server.calls[0].signal.aborted).toBe(false)
  })

  it('the same text with another language or tone is translated again', async () => {
    const s = setup()
    await translated(s, 'Hello everyone', { sourceCode: 'en', sourceName: 'English', formality: 'Informal' })
    await translated(s, 'Hello everyone', { sourceCode: 'en', sourceName: 'English', formality: 'Formal' })
    await translated(s, 'Hello everyone', { sourceCode: 'en', sourceName: 'English', formality: 'Formal', targetCode: 'it', targetName: 'Italian' })
    expect(s.server.calls).toHaveLength(3)
  })

  it('going back to the displayed text cancels the other version in flight', async () => {
    const s = setup()
    await translated(s, 'Bonjour à tous')
    s.scheduler.request(() => input('Bonjour à tous et toutes'), 'button')
    await flush()
    s.scheduler.request(() => input('Bonjour à tous'), 'button')
    await flush()
    expect(s.server.calls).toHaveLength(2)
    expect(s.server.calls[1].signal.aborted).toBe(true)
    expect(s.state).toMatchObject({ output: 'DE(Bonjour à tous)', loading: false, stale: false })
  })

  it('after a cancel, an error (Retry) or a cleared output, the same text can be sent again', async () => {
    // cancelled mid-way
    const s = setup()
    s.scheduler.request(() => input('Bonjour à tous'), 'button')
    await flush()
    s.scheduler.cancel()
    s.scheduler.request(() => input('Bonjour à tous'), 'button')
    await flush()
    expect(s.server.calls).toHaveLength(2)

    // output cleared by the user
    s.server.calls[1].push('Hallo')
    s.server.calls[1].end()
    await flush()
    s.scheduler.forget()
    s.scheduler.request(() => input('Bonjour à tous'), 'button')
    await flush()
    expect(s.server.calls).toHaveLength(3)

    // engine error, then Retry
    let attempts = 0
    const errors: string[] = []
    const flaky = new TranslationScheduler(CONFIG, () => ({
      async *[Symbol.asyncIterator]() {
        if (++attempts === 1) throw new Error('HTTP 502')
        yield 'Hallo'
      },
    }), { onLoading: () => {}, onOutput: () => {}, onError: e => { if (e) errors.push(e) }, onStale: () => {}, onSkip: () => {} })
    flaky.request(() => input('Bonjour à tous'), 'button')
    await flush()
    flaky.request(() => input('Bonjour à tous'), 'button')
    await flush()
    expect(errors).toEqual(['HTTP 502'])
    expect(attempts).toBe(2)
  })

  it('skips a text under the minimum length and clears the old translation', async () => {
    const s = setup()
    await translated(s, 'Bonjour')
    s.scheduler.request(() => input('Bo'), 'typing')
    await vi.advanceTimersByTimeAsync(CONFIG.debounceMs)
    s.scheduler.request(() => input(' ok '), 'button')
    await flush()
    expect(s.server.calls).toHaveLength(1)
    expect(s.state.skips.at(-1)).toBe('too_short')
    expect(s.state.output).toBe('')
  })

  it('skips a translation into the same base language and says so', async () => {
    const s = setup()
    for (const [src, tgt] of [['fr', 'fr-CH'], ['en', 'en'], ['en', 'en-GB'], ['de-CH', 'de']]) {
      s.scheduler.request(() => input('Bonjour à tous', { sourceCode: src, targetCode: tgt }), 'lang_change')
      await flush()
    }
    expect(s.server.calls).toHaveLength(0)
    expect(s.state.skips).toEqual(['same_language', 'same_language', 'same_language', 'same_language'])
  })

  it('still converts between Chinese scripts, and auto-detect is never "same language"', async () => {
    const s = setup()
    s.scheduler.request(() => input('你好，世界', { sourceCode: 'zh-Hans', targetCode: 'zh-Hant' }), 'button')
    await flush()
    s.scheduler.request(() => input('Bonjour à tous, comment allez-vous ?', { sourceCode: 'auto', autoDetect: true, targetCode: 'fr' }), 'button')
    await flush()
    expect(s.server.calls).toHaveLength(2)
  })

  it('with auto-detect, typing waits for autoDetectMinChars but the button does not', async () => {
    const s = setup()
    const auto = { sourceCode: 'auto', sourceName: 'Unknown', autoDetect: true }
    s.scheduler.request(() => input('Bonjour à t', auto), 'auto_detect')
    await vi.advanceTimersByTimeAsync(CONFIG.debounceMs)
    expect(s.server.calls).toHaveLength(0)
    expect(s.state.skips.at(-1)).toBe('auto_detect_wait')

    s.scheduler.request(() => input('Bonjour à tous, comment ça va', auto), 'auto_detect')
    await vi.advanceTimersByTimeAsync(CONFIG.debounceMs)
    expect(s.server.calls).toHaveLength(1)

    s.scheduler.request(() => input('Bonjour à t', auto), 'button')
    await flush()
    expect(s.server.calls).toHaveLength(2)
  })
})

describe('helpers', () => {
  it('normalizeForCompare only removes differences that do not change a translation', () => {
    expect(normalizeForCompare('  a \t b \n\n\n\n c  ')).toBe('a b\n\nc')
    expect(normalizeForCompare('a\nb')).not.toBe(normalizeForCompare('a\n\nb'))
  })

  it('sameBaseLanguage', () => {
    expect(sameBaseLanguage('fr', 'fr-CH')).toBe(true)
    expect(sameBaseLanguage('FR-ch', 'fr-be')).toBe(true)
    expect(sameBaseLanguage('fr', 'de-CH')).toBe(false)
    expect(sameBaseLanguage('zh-Hans', 'zh-Hant')).toBe(false)
    expect(sameBaseLanguage('zh-Hans', 'zh-Hans')).toBe(true)
    expect(sameBaseLanguage('auto', 'fr')).toBe(false)
    expect(sameBaseLanguage(undefined, 'fr')).toBe(false)
  })
})

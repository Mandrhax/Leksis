import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TranslationScheduler, type TranslationBody, type TranslationInput } from '@/lib/translate-scheduler'

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
  const state = { output: '', loading: false, error: '', stale: false }
  const scheduler = new TranslationScheduler(CONFIG, server.translate, {
    onLoading: l => { state.loading = l },
    onOutput:  o => { state.output = o },
    onError:   e => { state.error = e },
    onStale:   s => { state.stale = s },
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
    }), { onLoading: () => {}, onOutput: o => { state.output = o }, onError: () => {}, onStale: () => {} })
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
    }), { onLoading: () => {}, onOutput: () => {}, onError: e => { state.error = e }, onStale: () => {} })
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

import { describe, expect, it } from 'vitest'
import { acquireAiSlot, withAiSlot } from '@/lib/llm/concurrency'

describe('acquireAiSlot', () => {
  it('max <= 0 : jamais bloqué, quel que soit le nombre d\'acquisitions simultanées', async () => {
    const releases = await Promise.all([acquireAiSlot(0), acquireAiSlot(0), acquireAiSlot(-1)])
    releases.forEach(r => r())
  })

  it('max = 1 : la deuxième acquisition attend la libération de la première', async () => {
    const release1 = await acquireAiSlot(1)

    let secondAcquired = false
    const second = acquireAiSlot(1).then(release => { secondAcquired = true; return release })

    // Laisse le micro-task queue tourner : la deuxième acquisition ne doit toujours pas être résolue
    await Promise.resolve()
    await Promise.resolve()
    expect(secondAcquired).toBe(false)

    release1()
    const release2 = await second
    expect(secondAcquired).toBe(true)
    release2()
  })

  it('l\'annulation d\'une attente en file ne libère pas un emplacement qu\'elle n\'a jamais obtenu', async () => {
    const release1 = await acquireAiSlot(1)
    const controller = new AbortController()

    const waiting = acquireAiSlot(1, controller.signal)
    controller.abort()
    await expect(waiting).rejects.toThrow(/abort/i)

    // Un tiers attend toujours : l'annulation du précédent n'a pas dû lui donner l'emplacement
    let thirdAcquired = false
    const third = acquireAiSlot(1).then(release => { thirdAcquired = true; return release })
    await Promise.resolve()
    await Promise.resolve()
    expect(thirdAcquired).toBe(false)

    release1()
    const release3 = await third
    expect(thirdAcquired).toBe(true)
    release3()
  })

  it('un signal déjà annulé refuse immédiatement quand il faut attendre', async () => {
    const release1 = await acquireAiSlot(1)
    await expect(acquireAiSlot(1, AbortSignal.abort())).rejects.toThrow(/abort/i)
    release1()
  })
})

describe('withAiSlot', () => {
  it('libère l\'emplacement même si la fonction échoue', async () => {
    await expect(withAiSlot(1, async () => { throw new Error('boom') })).rejects.toThrow('boom')
    // L'emplacement a bien été libéré : une nouvelle acquisition n'attend pas
    const release = await acquireAiSlot(1)
    release()
  })
})

describe('gateStream', () => {
  const textStream = (text: string, onStart: () => void) => new ReadableStream<Uint8Array>({
    start(c) { onStart(); c.enqueue(new TextEncoder().encode(text)); c.close() },
  })
  const drain = async (s: ReadableStream<Uint8Array>) => {
    const r = s.getReader(); let out = ''
    for (;;) { const { done, value } = await r.read(); if (done) return out; out += new TextDecoder().decode(value) }
  }

  it('does not start the engine call before a slot is free, and frees it at the end', async () => {
    const { gateStream } = await import('@/lib/llm/concurrency')
    const release1 = await acquireAiSlot(1)
    let started = false
    const gated = gateStream(1, undefined, () => textStream('hello', () => { started = true }))
    const output = drain(gated)
    await new Promise(r => setTimeout(r, 10))
    expect(started).toBe(false)           // still queued: no request sent to the engine
    release1()
    expect(await output).toBe('hello')
    expect(started).toBe(true)
    // The slot came back: the next acquisition is immediate
    const next = await Promise.race([acquireAiSlot(1), new Promise(r => setTimeout(() => r('blocked'), 20))])
    expect(next).not.toBe('blocked')
    if (typeof next === 'function') next()
  })

  it('a request cancelled while queued never reaches the engine', async () => {
    const { gateStream } = await import('@/lib/llm/concurrency')
    const release1 = await acquireAiSlot(1)
    const controller = new AbortController()
    let started = false
    const gated = gateStream(1, controller.signal, () => textStream('x', () => { started = true }))
    const output = drain(gated)
    controller.abort()
    await expect(output).rejects.toThrow(/abort/i)
    release1()
    await new Promise(r => setTimeout(r, 10))
    expect(started).toBe(false)
  })
})

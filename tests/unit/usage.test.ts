import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'

// `@/lib/db` backed by an in-memory PostgreSQL loaded with the real schema
const pg = vi.hoisted(() => ({ db: null as unknown as PGlite }))
vi.mock('@/lib/db', () => ({
  query: async (text: string, params?: unknown[]) => {
    const r = await pg.db.query(text, params)
    return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length }
  },
}))

import { logUsage, normalizeUsageLang, trackUsageStream, type UsageEntry } from '@/lib/usage'
import { UsageTrackingSchema } from '@/lib/usage-schema'

const schema = readFileSync(new URL('../../docker/init-schema.sql', import.meta.url), 'utf8').replace(/CREATE EXTENSION[^\n]*\n/g, '')
const migration = readFileSync(new URL('../../docker/migrations/006-usage-log-tracking.sql', import.meta.url), 'utf8')

beforeAll(async () => {
  pg.db = new PGlite()
  await pg.db.exec(schema)
})

const entry: UsageEntry = { userEmail: 'u@x.ch', feature: 'text', sourceLang: 'fr', targetLang: 'de-CH', charCount: 10 }
const enc = new TextEncoder()

function streamOf(chunks: string[], fail?: Error): ReadableStream<Uint8Array> {
  let i = 0
  return new ReadableStream<Uint8Array>({
    pull(c) {
      if (i < chunks.length) { c.enqueue(enc.encode(chunks[i++])); return }
      if (fail) c.error(fail); else c.close()
    },
  })
}

async function drain(s: ReadableStream<Uint8Array>) {
  const r = s.getReader()
  let out = ''
  const dec = new TextDecoder()
  while (true) {
    const { done, value } = await r.read()
    if (done) return out
    out += dec.decode(value)
  }
}

describe('normalizeUsageLang', () => {
  it('keeps BCP 47 codes and fixes their case', () => {
    expect(normalizeUsageLang('fr-CH')).toBe('fr-CH')
    expect(normalizeUsageLang('FR-ch')).toBe('fr-CH')
  })
  it('turns a language name into its code', () => {
    expect(normalizeUsageLang('French')).toBe('fr')
    expect(normalizeUsageLang('German (Switzerland)')).toBe('de-CH')
  })
  it('writes an explicit value instead of an empty field', () => {
    expect(normalizeUsageLang(undefined)).toBe('n/a')
    expect(normalizeUsageLang('  ')).toBe('n/a')
    expect(normalizeUsageLang('Unknown')).toBe('auto')
  })
})

describe('trackUsageStream', () => {
  it('logs once, at the end, as completed with the latency', async () => {
    const log = vi.fn()
    const out = trackUsageStream(streamOf(['Hal', 'lo']), { ...entry }, Date.now() - 50, log)
    expect(log).not.toHaveBeenCalled()
    expect(await drain(out)).toBe('Hallo')
    expect(log).toHaveBeenCalledTimes(1)
    expect(log.mock.calls[0][0]).toMatchObject({ status: 'completed' })
    expect(log.mock.calls[0][0].latencyMs).toBeGreaterThanOrEqual(50)
  })

  it('logs cancelled when the client goes away', async () => {
    const log = vi.fn()
    const out = trackUsageStream(streamOf(['a', 'b', 'c']), { ...entry }, Date.now(), log)
    const reader = out.getReader()
    await reader.read()
    await reader.cancel()
    expect(log).toHaveBeenCalledTimes(1)
    expect(log.mock.calls[0][0].status).toBe('cancelled')
  })

  it('logs cancelled on an abort and error on an engine failure', async () => {
    const log = vi.fn()
    await expect(drain(trackUsageStream(streamOf([], new DOMException('x', 'AbortError')), { ...entry }, Date.now(), log))).rejects.toThrow()
    await expect(drain(trackUsageStream(streamOf(['a'], new Error('Ollama HTTP 500')), { ...entry }, Date.now(), log))).rejects.toThrow()
    expect(log.mock.calls.map(c => c[0].status)).toEqual(['cancelled', 'error'])
  })

  it('keeps a status set by the caller (cache hit) and reads modelChars at the end', async () => {
    const log = vi.fn()
    const e: UsageEntry = { ...entry, status: 'cache_hit' }
    const out = trackUsageStream(streamOf(['x']), e, Date.now(), log)
    e.modelChars = 0
    await drain(out)
    expect(log.mock.calls[0][0]).toMatchObject({ status: 'cache_hit', modelChars: 0 })
  })
})

describe('UsageTrackingSchema', () => {
  it('drops invalid values rather than rejecting the request', () => {
    expect(UsageTrackingSchema.parse({ trigger: 'paste', requestGroupId: 'a1-b2' })).toEqual({ trigger: 'paste', requestGroupId: 'a1-b2' })
    expect(UsageTrackingSchema.parse({ trigger: 'hack', requestGroupId: "'; DROP" })).toEqual({})
  })
})

describe('logUsage', () => {
  it('writes the tracking columns at the end of the row', async () => {
    logUsage({ ...entry, sourceLang: 'French', trigger: 'button', status: 'completed', modelChars: 8, latencyMs: 120, requestGroupId: 'g1' })
    await vi.waitFor(async () => {
      const { rows } = await pg.db.query<Record<string, unknown>>("SELECT * FROM usage_log WHERE request_group_id = 'g1'")
      expect(rows[0]).toMatchObject({
        source_lang: 'fr', target_lang: 'de-CH', trigger_type: 'button', status: 'completed', model_chars: 8, latency_ms: 120,
      })
    })
  })

  it('migration 006 is idempotent on an up-to-date schema', async () => {
    await pg.db.exec(migration)
    await pg.db.exec(migration)
  })
})

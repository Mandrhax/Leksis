import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'

const pg = vi.hoisted(() => ({ db: null as unknown as PGlite }))
vi.mock('@/lib/db', () => ({
  query: async (text: string, params?: unknown[]) => {
    const r = await pg.db.query(text, params)
    return { rows: r.rows, rowCount: r.rowCount }
  },
}))

import { generateOtp, verifyOtp, OTP_MAX_ATTEMPTS } from '@/lib/otp'

const schema = readFileSync(new URL('../../docker/init-schema.sql', import.meta.url), 'utf8').replace(/CREATE EXTENSION[^\n]*\n/g, '')

beforeEach(async () => {
  pg.db = new PGlite()
  await pg.db.exec(schema)
})

const wrong = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, '0')

describe('OTP codes', () => {
  it('stores only a hash of the code', async () => {
    const code = await generateOtp('a@x.ch')
    const rows = (await pg.db.query<{ token: string }>('SELECT token FROM otp_tokens')).rows
    expect(rows).toHaveLength(1)
    expect(rows[0].token).not.toContain(code)
    expect(rows[0].token).toMatch(/^[0-9a-f]{64}$/)
  })

  it('accepts the right code once', async () => {
    const code = await generateOtp('a@x.ch')
    expect(await verifyOtp('a@x.ch', code)).toBe(true)
    expect(await verifyOtp('a@x.ch', code)).toBe(false)
  })

  it('invalidates the code after too many wrong guesses, even if the right one comes next', async () => {
    const code = await generateOtp('a@x.ch')
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) expect(await verifyOtp('a@x.ch', wrong(code))).toBe(false)
    expect(await verifyOtp('a@x.ch', code)).toBe(false)
  })

  it('a few wrong guesses below the limit do not lock the code', async () => {
    const code = await generateOtp('a@x.ch')
    for (let i = 0; i < OTP_MAX_ATTEMPTS - 1; i++) await verifyOtp('a@x.ch', wrong(code))
    expect(await verifyOtp('a@x.ch', code)).toBe(true)
  })

  it('wrong guesses on one email do not affect another', async () => {
    const other = await generateOtp('b@x.ch')
    const code = await generateOtp('a@x.ch')
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) await verifyOtp('a@x.ch', wrong(code))
    expect(await verifyOtp('b@x.ch', other)).toBe(true)
  })

  it('a new code replaces the previous one', async () => {
    const first = await generateOtp('a@x.ch')
    const second = await generateOtp('a@x.ch')
    if (first !== second) expect(await verifyOtp('a@x.ch', first)).toBe(false)
    expect(await verifyOtp('a@x.ch', second)).toBe(true)
  })
})

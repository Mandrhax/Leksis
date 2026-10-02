import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'

const pg = vi.hoisted(() => ({ db: null as unknown as PGlite }))
vi.mock('@/lib/db', () => ({
  // PGlite renvoie déjà un rowCount correct pour SELECT/INSERT/UPDATE/DELETE (contrairement à affectedRows,
  // toujours 0 pour un SELECT) — pas besoin de le recalculer.
  query: async (text: string, params?: unknown[]) => {
    const r = await pg.db.query(text, params)
    return { rows: r.rows, rowCount: r.rowCount }
  },
}))

import {
  activateVerifiedAccount, consumeEmailToken, createEmailToken, createOrAttachPendingAccount,
  getAccountByEmail, getOrCreateAccount,
} from '@/lib/accounts'

const schema = readFileSync(new URL('../../docker/init-schema.sql', import.meta.url), 'utf8').replace(/CREATE EXTENSION[^\n]*\n/g, '')

beforeEach(async () => {
  pg.db = new PGlite()
  await pg.db.exec(schema)
})

describe('getAccountByEmail', () => {
  it('returns null for an unknown email', async () => {
    expect(await getAccountByEmail('nobody@x.ch')).toBeNull()
  })

  it('returns the account with its status and password_hash', async () => {
    await pg.db.query("INSERT INTO users (email, role) VALUES ('a@x.ch', 'admin')")
    expect(await getAccountByEmail('a@x.ch')).toMatchObject({
      email: 'a@x.ch', role: 'admin', disabled: false, status: 'active', password_hash: null,
    })
  })
})

describe('getOrCreateAccount', () => {
  it('creates a new active account on first call', async () => {
    const acc = await getOrCreateAccount('new@x.ch', 'New')
    expect(acc).toMatchObject({ email: 'new@x.ch', name: 'New', role: 'user', status: 'active' })
  })

  it('is idempotent: returns the existing account on a second call', async () => {
    const first = await getOrCreateAccount('new@x.ch')
    const second = await getOrCreateAccount('new@x.ch')
    expect(second.id).toBe(first.id)
  })

  it('does not overwrite an existing account role/status', async () => {
    await pg.db.query("INSERT INTO users (email, role, status) VALUES ('admin@x.ch', 'admin', 'active')")
    const acc = await getOrCreateAccount('admin@x.ch')
    expect(acc).toMatchObject({ role: 'admin', status: 'active' })
  })
})

describe('createOrAttachPendingAccount', () => {
  it('creates a brand-new pending account', async () => {
    const result = await createOrAttachPendingAccount('bob@x.ch', 'Bob', 'scrypt:hash', 'pending_approval')
    expect(result).toMatchObject({
      outcome: 'created',
      account: { email: 'bob@x.ch', name: 'Bob', status: 'pending_approval', password_hash: 'scrypt:hash' },
    })
  })

  // Anti pré-piratage : quiconque connaît l'email d'un compte existant sans mot de passe (admin d'installation,
  // compte OTP/SSO) ne doit pas pouvoir y poser le sien — la victime n'aurait qu'à cliquer le lien de
  // vérification (ou un scanner de messagerie le ferait pour elle).
  it('refuses to attach a password to an existing account without a password_hash, and writes nothing', async () => {
    await pg.db.query("INSERT INTO users (email, name, role) VALUES ('otp@x.ch', 'Otp User', 'admin')")
    const result = await createOrAttachPendingAccount('otp@x.ch', 'Mallory', 'scrypt:evil', 'pending_verification')
    expect(result).toEqual({ outcome: 'already_active' })
    const row = await pg.db.query<{ password_hash: string | null; status: string; name: string }>(
      'SELECT password_hash, status, name FROM users WHERE email = $1', ['otp@x.ch'])
    expect(row.rows[0]).toEqual({ password_hash: null, status: 'active', name: 'Otp User' })
  })

  it('reports an already-active account without writing anything', async () => {
    await pg.db.query("INSERT INTO users (email, password_hash, status) VALUES ('active@x.ch', 'scrypt:old', 'active')")
    const result = await createOrAttachPendingAccount('active@x.ch', null, 'scrypt:new', 'pending_verification')
    expect(result).toEqual({ outcome: 'already_active' })
    const row = await pg.db.query<{ password_hash: string }>('SELECT password_hash FROM users WHERE email = $1', ['active@x.ch'])
    expect(row.rows[0].password_hash).toBe('scrypt:old')
  })

  it('offers to resend the verification email for a pending_verification account', async () => {
    await pg.db.query("INSERT INTO users (email, password_hash, status) VALUES ('pv@x.ch', 'scrypt:old', 'pending_verification')")
    const result = await createOrAttachPendingAccount('pv@x.ch', null, 'scrypt:new', 'pending_verification')
    expect(result.outcome).toBe('resend_verification')
    if (result.outcome === 'resend_verification') expect(result.account.email).toBe('pv@x.ch')
  })

  it('reports an already-pending admin-approval account without writing anything', async () => {
    await pg.db.query("INSERT INTO users (email, password_hash, status) VALUES ('pa@x.ch', 'scrypt:old', 'pending_approval')")
    const result = await createOrAttachPendingAccount('pa@x.ch', null, 'scrypt:new', 'pending_approval')
    expect(result).toEqual({ outcome: 'already_pending' })
  })
})

describe('createEmailToken / consumeEmailToken', () => {
  it('round-trips: the token consumes to the email it was issued for', async () => {
    const token = await createEmailToken('bob@x.ch', 'verify_email')
    expect(await consumeEmailToken(token, 'verify_email')).toBe('bob@x.ch')
  })

  it('is single-use: a second consumption fails', async () => {
    const token = await createEmailToken('bob@x.ch', 'verify_email')
    expect(await consumeEmailToken(token, 'verify_email')).toBe('bob@x.ch')
    expect(await consumeEmailToken(token, 'verify_email')).toBeNull()
  })

  it('rejects an unknown token', async () => {
    expect(await consumeEmailToken('not-a-real-token', 'verify_email')).toBeNull()
  })

  it('is scoped by purpose: a token for one purpose does not consume for another', async () => {
    const token = await createEmailToken('bob@x.ch', 'verify_email')
    expect(await consumeEmailToken(token, 'password_reset')).toBeNull()
    expect(await consumeEmailToken(token, 'verify_email')).toBe('bob@x.ch')
  })

  it('invalidates the previous token for the same email and purpose when a new one is issued', async () => {
    const first = await createEmailToken('bob@x.ch', 'verify_email')
    const second = await createEmailToken('bob@x.ch', 'verify_email')
    expect(second).not.toBe(first)
    expect(await consumeEmailToken(first, 'verify_email')).toBeNull()
    expect(await consumeEmailToken(second, 'verify_email')).toBe('bob@x.ch')
  })
})

describe('activateVerifiedAccount', () => {
  it('activates a pending_verification account', async () => {
    await pg.db.query("INSERT INTO users (email, password_hash, status) VALUES ('bob@x.ch', 'scrypt:x', 'pending_verification')")
    expect(await activateVerifiedAccount('bob@x.ch')).toBe(true)
    const row = await pg.db.query<{ status: string }>('SELECT status FROM users WHERE email = $1', ['bob@x.ch'])
    expect(row.rows[0].status).toBe('active')
  })

  it('has no effect on an account that is not pending_verification (stale token)', async () => {
    await pg.db.query("INSERT INTO users (email, password_hash, status) VALUES ('bob@x.ch', 'scrypt:x', 'pending_approval')")
    expect(await activateVerifiedAccount('bob@x.ch')).toBe(false)
    const row = await pg.db.query<{ status: string }>('SELECT status FROM users WHERE email = $1', ['bob@x.ch'])
    expect(row.rows[0].status).toBe('pending_approval')
  })

  it('returns false for an unknown email', async () => {
    expect(await activateVerifiedAccount('nobody@x.ch')).toBe(false)
  })
})

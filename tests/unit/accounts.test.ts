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
  getAccountByEmail, getAccountByOidcIdentity, resolveOidcAccount, acceptInvitation, peekEmailToken,
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

describe('resolveOidcAccount', () => {
  const idp = 'https://idp.example.com'
  const sso = (sub: string, email: string, create = true) => resolveOidcAccount({ issuer: idp, sub, email, name: 'N', create })

  it('creates a new active account bound to the identity on first sign-in', async () => {
    const acc = await sso('sub-1', 'new@x.ch')
    expect(acc).toMatchObject({ email: 'new@x.ch', role: 'user', status: 'active' })
    expect(await getAccountByOidcIdentity(idp, 'sub-1')).toMatchObject({ id: acc!.id })
  })

  it('links an existing account by email once, then finds it by subject even if the email claim changes', async () => {
    await pg.db.query("INSERT INTO users (email, role) VALUES ('admin@x.ch', 'admin')")
    const first = await sso('sub-admin', 'admin@x.ch')
    const later = await sso('sub-admin', 'renamed@x.ch')
    expect(later?.id).toBe(first?.id)
    expect(later).toMatchObject({ email: 'admin@x.ch', role: 'admin' })
  })

  it('refuses another subject presenting the email of an already linked account (nOAuth)', async () => {
    await pg.db.query("INSERT INTO users (email, role) VALUES ('admin@x.ch', 'admin')")
    await sso('sub-admin', 'admin@x.ch')
    expect(await sso('sub-attacker', 'admin@x.ch')).toBeNull()
  })

  it('relinks an account bound to another identity provider (the admin switched providers)', async () => {
    await pg.db.query("INSERT INTO users (email, oidc_issuer, oidc_sub) VALUES ('u@x.ch', 'https://old-idp', 'old-sub')")
    expect(await sso('new-sub', 'u@x.ch')).toMatchObject({ email: 'u@x.ch' })
    expect(await getAccountByOidcIdentity(idp, 'new-sub')).toMatchObject({ email: 'u@x.ch' })
  })

  it('invite-only: no account is created for an unknown identity', async () => {
    expect(await sso('sub-x', 'stranger@x.ch', false)).toBeNull()
    expect(await getAccountByEmail('stranger@x.ch')).toBeNull()
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

  it('the latest sign-up replaces the password of an unverified account (pre-registration by someone else)', async () => {
    await pg.db.query("INSERT INTO users (email, password_hash, status) VALUES ('pre@x.ch', 'scrypt:attacker', 'pending_verification')")
    await createOrAttachPendingAccount('pre@x.ch', 'Owner', 'scrypt:owner', 'pending_verification')
    const row = (await pg.db.query<{ password_hash: string; name: string }>("SELECT password_hash, name FROM users WHERE email = 'pre@x.ch'")).rows[0]
    expect(row).toEqual({ password_hash: 'scrypt:owner', name: 'Owner' })
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

describe('invitation link (peekEmailToken / acceptInvitation)', () => {
  it('peeking does not consume the token', async () => {
    const token = await createEmailToken('inv@x.ch', 'invite')
    expect(await peekEmailToken(token, 'invite')).toBe('inv@x.ch')
    expect(await peekEmailToken(token, 'invite')).toBe('inv@x.ch')
  })

  it('sets the chosen password, activates the account, and works only once', async () => {
    await pg.db.query("INSERT INTO users (email, status) VALUES ('inv@x.ch', 'pending_verification')")
    const token = await createEmailToken('inv@x.ch', 'invite')
    expect(await acceptInvitation(token, 'scrypt:chosen')).toEqual({ ok: true, email: 'inv@x.ch' })
    const row = await pg.db.query<{ password_hash: string; status: string }>('SELECT password_hash, status FROM users WHERE email = $1', ['inv@x.ch'])
    expect(row.rows[0]).toEqual({ password_hash: 'scrypt:chosen', status: 'active' })
    expect(await acceptInvitation(token, 'scrypt:second')).toEqual({ ok: false })
    const again = await pg.db.query<{ password_hash: string }>('SELECT password_hash FROM users WHERE email = $1', ['inv@x.ch'])
    expect(again.rows[0].password_hash).toBe('scrypt:chosen')
  })

  it('rejects a token of another purpose (an email-verification token cannot set a password)', async () => {
    await pg.db.query("INSERT INTO users (email) VALUES ('inv@x.ch')")
    const verifyToken = await createEmailToken('inv@x.ch', 'verify_email')
    expect(await acceptInvitation(verifyToken, 'scrypt:evil')).toEqual({ ok: false })
    expect(await peekEmailToken(verifyToken, 'invite')).toBeNull()
  })

  it('rejects an expired token', async () => {
    await pg.db.query("INSERT INTO users (email) VALUES ('inv@x.ch')")
    const token = await createEmailToken('inv@x.ch', 'invite', -1000)
    expect(await peekEmailToken(token, 'invite')).toBeNull()
    expect(await acceptInvitation(token, 'scrypt:late')).toEqual({ ok: false })
  })

  it('gives nothing to an account disabled after the link was issued', async () => {
    await pg.db.query("INSERT INTO users (email, disabled) VALUES ('inv@x.ch', TRUE)")
    const token = await createEmailToken('inv@x.ch', 'invite')
    expect(await acceptInvitation(token, 'scrypt:x')).toEqual({ ok: false })
    const row = await pg.db.query<{ password_hash: string | null }>('SELECT password_hash FROM users WHERE email = $1', ['inv@x.ch'])
    expect(row.rows[0].password_hash).toBeNull()
  })

  it('a newer link replaces the previous one', async () => {
    await pg.db.query("INSERT INTO users (email) VALUES ('inv@x.ch')")
    const first = await createEmailToken('inv@x.ch', 'invite')
    const second = await createEmailToken('inv@x.ch', 'invite')
    expect(await acceptInvitation(first, 'scrypt:old')).toEqual({ ok: false })
    expect(await acceptInvitation(second, 'scrypt:new')).toEqual({ ok: true, email: 'inv@x.ch' })
  })
})

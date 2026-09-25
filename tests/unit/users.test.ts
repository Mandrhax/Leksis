import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'

// `@/lib/db` backed by an in-memory PostgreSQL loaded with the real schema
const pg = vi.hoisted(() => ({ db: null as unknown as PGlite }))
vi.mock('@/lib/db', () => ({
  query: async (text: string, params?: unknown[]) => {
    const r = await pg.db.query(text, params)
    return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length }
  },
  withTransaction: async (fn: (q: unknown) => Promise<unknown>) =>
    pg.db.transaction(async tx => fn(async (text: string, params?: unknown[]) => {
      const r = await tx.query(text, params)
      return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length }
    })),
}))

import { changeUser, getUserRole, listUsers, removeUser } from '@/lib/users'

const schema = readFileSync(new URL('../../docker/init-schema.sql', import.meta.url), 'utf8').replace(/CREATE EXTENSION[^\n]*\n/g, '')

async function addUser(email: string, role = 'user', name: string | null = null): Promise<string> {
  const r = await pg.db.query<{ id: string }>('INSERT INTO users (email, role, name) VALUES ($1, $2, $3) RETURNING id', [email, role, name])
  return r.rows[0].id
}

beforeEach(async () => {
  pg.db = new PGlite()
  await pg.db.exec(schema)
})

describe('getUserRole', () => {
  it('returns the role, and null once the account is disabled or deleted', async () => {
    const admin = await addUser('a@x.ch', 'admin')
    const bob = await addUser('bob@x.ch')
    expect(await getUserRole(bob, { fresh: true })).toBe('user')
    await changeUser(admin, bob, { disabled: true })
    expect(await getUserRole(bob)).toBeNull() // cache invalidated by changeUser
    await changeUser(admin, bob, { disabled: false })
    expect(await getUserRole(bob)).toBe('user')
    await removeUser(admin, bob)
    expect(await getUserRole(bob)).toBeNull()
  })
})

describe('changeUser', () => {
  it('promotes, demotes, disables and re-enables', async () => {
    const admin = await addUser('a@x.ch', 'admin')
    const bob = await addUser('bob@x.ch')
    expect(await changeUser(admin, bob, { role: 'admin' })).toMatchObject({ ok: true, user: { email: 'bob@x.ch', role: 'admin' } })
    expect(await changeUser(admin, bob, { role: 'user', disabled: true })).toMatchObject({ ok: true, user: { role: 'user', disabled: true } })
    const row = await pg.db.query<{ role: string; disabled: boolean }>('SELECT role, disabled FROM users WHERE id = $1', [bob])
    expect(row.rows[0]).toEqual({ role: 'user', disabled: true })
  })

  it('reports an unknown user', async () => {
    const admin = await addUser('a@x.ch', 'admin')
    expect(await changeUser(admin, 'nope', { role: 'admin' })).toEqual({ ok: false, error: 'not_found' })
  })

  it('refuses to demote, disable or delete yourself, but allows a no-op', async () => {
    const admin = await addUser('a@x.ch', 'admin')
    await addUser('b@x.ch', 'admin')
    expect(await changeUser(admin, admin, { role: 'user' })).toEqual({ ok: false, error: 'self' })
    expect(await changeUser(admin, admin, { disabled: true })).toEqual({ ok: false, error: 'self' })
    expect(await removeUser(admin, admin)).toEqual({ ok: false, error: 'self' })
    expect(await changeUser(admin, admin, { role: 'admin', disabled: false })).toMatchObject({ ok: true })
  })

  it('keeps at least one active administrator', async () => {
    const a = await addUser('a@x.ch', 'admin')
    const b = await addUser('b@x.ch', 'admin')
    // b is the only OTHER active admin: once a disables b, a is alone — and cannot be removed by anyone but a itself
    expect(await changeUser(a, b, { disabled: true })).toMatchObject({ ok: true })
    // b is now disabled, so it no longer counts: promoting/demoting a stays blocked for a (self)…
    expect(await changeUser(b, a, { role: 'user' })).toEqual({ ok: false, error: 'last_admin' })
    expect(await removeUser(b, a)).toEqual({ ok: false, error: 'last_admin' })
    expect(await changeUser(b, a, { disabled: true })).toEqual({ ok: false, error: 'last_admin' })
    // …and an admin that is already disabled can be removed freely
    expect(await removeUser(a, b)).toMatchObject({ ok: true })
  })
})

describe('removeUser', () => {
  it('deletes the account and its glossary preferences, keeps usage history', async () => {
    const admin = await addUser('a@x.ch', 'admin')
    const bob = await addUser('bob@x.ch')
    const g = await pg.db.query<{ id: number }>("INSERT INTO glossaries (name) VALUES ('g') RETURNING id")
    await pg.db.query('INSERT INTO user_glossary_prefs (user_id, glossary_id, enabled) VALUES ($1, $2, FALSE)', [bob, g.rows[0].id])
    await pg.db.query("INSERT INTO usage_log (user_id, user_email, feature) VALUES ($1, 'bob@x.ch', 'translate')", [bob])

    expect(await removeUser(admin, bob)).toMatchObject({ ok: true, user: { email: 'bob@x.ch' } })
    expect((await pg.db.query('SELECT 1 FROM users WHERE id = $1', [bob])).rows).toHaveLength(0)
    expect((await pg.db.query('SELECT 1 FROM user_glossary_prefs WHERE user_id = $1', [bob])).rows).toHaveLength(0)
    expect((await pg.db.query('SELECT 1 FROM usage_log WHERE user_id = $1', [bob])).rows).toHaveLength(1)
    expect(await removeUser(admin, bob)).toEqual({ ok: false, error: 'not_found' })
  })
})

describe('listUsers', () => {
  beforeEach(async () => {
    for (let i = 1; i <= 7; i++) {
      await pg.db.query('INSERT INTO users (email, name, created_at) VALUES ($1, $2, NOW() - make_interval(mins => $3))', [`user${i}@x.ch`, i === 3 ? 'Zoé 100%' : null, i])
    }
  })

  it('paginates from the most recent, with the total', async () => {
    const p1 = await listUsers({ page: 1, pageSize: 3 })
    expect(p1).toMatchObject({ total: 7, page: 1, pageSize: 3 })
    expect(p1.users.map(u => u.email)).toEqual(['user1@x.ch', 'user2@x.ch', 'user3@x.ch'])
    expect((await listUsers({ page: 3, pageSize: 3 })).users.map(u => u.email)).toEqual(['user7@x.ch'])
  })

  it('clamps the page and the page size', async () => {
    expect((await listUsers({ page: 99, pageSize: 3 })).page).toBe(3)
    expect((await listUsers({ page: -5, pageSize: 3 })).page).toBe(1)
    expect((await listUsers({ pageSize: 100000 })).pageSize).toBe(100)
    expect((await listUsers({ pageSize: NaN })).pageSize).toBe(25)
  })

  it('searches email and name, case-insensitive', async () => {
    expect((await listUsers({ q: 'USER5' })).users.map(u => u.email)).toEqual(['user5@x.ch'])
    expect((await listUsers({ q: 'zoé' })).users.map(u => u.email)).toEqual(['user3@x.ch'])
  })

  it('treats % and _ in the search as plain characters', async () => {
    expect((await listUsers({ q: '100%' })).total).toBe(1)
    expect((await listUsers({ q: '%' })).total).toBe(1) // only the name containing a literal %
    expect((await listUsers({ q: 'user_' })).total).toBe(0)
  })
})

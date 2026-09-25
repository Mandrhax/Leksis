import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'

const pg = vi.hoisted(() => ({ db: null as unknown as PGlite }))
vi.mock('@/lib/db', () => ({
  query: async (text: string, params?: unknown[]) => {
    const r = await pg.db.query(text, params)
    return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length }
  },
}))

import { labelAuditResources } from '@/lib/audit'

const schema = readFileSync(new URL('../../docker/init-schema.sql', import.meta.url), 'utf8').replace(/CREATE EXTENSION[^\n]*\n/g, '')

beforeEach(async () => {
  pg.db = new PGlite()
  await pg.db.exec(schema)
})

describe('labelAuditResources', () => {
  it('shows the email of an existing account instead of its id', async () => {
    const u = await pg.db.query<{ id: string }>("INSERT INTO users (email) VALUES ('bob@x.ch') RETURNING id")
    const [row] = await labelAuditResources([{ resource: `user:${u.rows[0].id}`, detail: null }])
    expect(row.resource_label).toBe('user:bob@x.ch')
    expect(row.resource).toBe(`user:${u.rows[0].id}`) // the raw value is kept
  })

  it('falls back to the email stored in the entry for a deleted account, then to the id', async () => {
    const rows = await labelAuditResources([
      { resource: 'user:gone-1', detail: { email: 'old@x.ch', role: 'user' } },
      { resource: 'user:gone-2', detail: { role: 'user' } },
      { resource: 'user:gone-3' },
    ])
    expect(rows.map(r => r.resource_label)).toEqual(['user:old@x.ch', 'user:gone-2', 'user:gone-3'])
  })

  it('leaves other resources alone and does not query when there is no user resource', async () => {
    const rows = await labelAuditResources([{ resource: 'settings:general' }, { resource: 'usage_log' }])
    expect(rows.map(r => r.resource_label)).toEqual(['settings:general', 'usage_log'])
  })
})

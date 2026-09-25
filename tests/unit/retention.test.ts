import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'

// `@/lib/db` backed by an in-memory PostgreSQL loaded with the real schema; settings and audit are the real modules
const pg = vi.hoisted(() => ({ db: null as unknown as PGlite }))
vi.mock('@/lib/db', () => ({
  query: async (text: string, params?: unknown[]) => {
    const r = await pg.db.query(text, params)
    return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length }
  },
}))

import { purgeExpiredLogs } from '@/lib/retention'
import { invalidateSettings } from '@/lib/settings'

const schema = readFileSync(new URL('../../docker/init-schema.sql', import.meta.url), 'utf8').replace(/CREATE EXTENSION[^\n]*\n/g, '')

async function addUsage(daysAgo: number, n = 1) {
  await pg.db.query(
    `INSERT INTO usage_log (user_id, user_email, feature, created_at)
     SELECT 'u', 'u@x.ch', 'translate', NOW() - make_interval(days => $1) FROM generate_series(1, $2)`,
    [daysAgo, n],
  )
}
async function addAudit(daysAgo: number, n = 1) {
  await pg.db.query(
    `INSERT INTO audit_log (user_id, user_email, action, resource, created_at)
     SELECT 'u', 'u@x.ch', 'TEST', 'x', NOW() - make_interval(days => $1) FROM generate_series(1, $2)`,
    [daysAgo, n],
  )
}
const count = async (table: string, where = 'TRUE') =>
  Number((await pg.db.query<{ n: string }>(`SELECT count(*) AS n FROM ${table} WHERE ${where}`)).rows[0].n)
async function setGeneral(value: object) {
  await pg.db.query("INSERT INTO site_settings (key, value) VALUES ('general', $1::jsonb) ON CONFLICT (key) DO UPDATE SET value = $1::jsonb", [JSON.stringify(value)])
  invalidateSettings()
}

beforeEach(async () => {
  pg.db = new PGlite()
  await pg.db.exec(schema)
  invalidateSettings()
})

describe('purgeExpiredLogs', () => {
  it('uses 365 days for usage and 730 for audit when nothing is configured', async () => {
    await addUsage(10); await addUsage(364); await addUsage(366, 2)
    await addAudit(10); await addAudit(729); await addAudit(731, 3)
    expect(await purgeExpiredLogs()).toEqual({ usage: 2, audit: 3 })
    expect(await count('usage_log')).toBe(2)
    expect(await count('audit_log', "action = 'TEST'")).toBe(2)
  })

  it('follows the configured durations', async () => {
    await setGeneral({ usageRetentionDays: 30, auditRetentionDays: 7 })
    await addUsage(29); await addUsage(31, 2)
    await addAudit(6); await addAudit(8, 4)
    expect(await purgeExpiredLogs()).toEqual({ usage: 2, audit: 4 })
  })

  it('keeps everything for a table set to 0, and purges the other one', async () => {
    await setGeneral({ usageRetentionDays: 0, auditRetentionDays: 30 })
    await addUsage(5000, 3); await addAudit(5000, 3)
    expect(await purgeExpiredLogs()).toEqual({ usage: 0, audit: 3 })
    expect(await count('usage_log')).toBe(3)
  })

  it('records what it deleted in the audit log, after deleting (the trace survives)', async () => {
    await addAudit(800, 2)
    await purgeExpiredLogs()
    const trace = await pg.db.query<{ user_email: string; action: string; detail: { deleted: number; retentionDays: number } }>(
      "SELECT user_email, action, detail FROM audit_log WHERE action = 'AUTO_PURGE_AUDIT'")
    expect(trace.rows).toHaveLength(1)
    expect(trace.rows[0]).toMatchObject({ user_email: 'system', detail: { deleted: 2, retentionDays: 730 } })
  })

  it('writes nothing when there is nothing to delete', async () => {
    await addUsage(1); await addAudit(1)
    expect(await purgeExpiredLogs()).toEqual({ usage: 0, audit: 0 })
    expect(await count('audit_log', "action LIKE 'AUTO_PURGE%'")).toBe(0)
  })

  it('deletes more than one batch', async () => {
    await addUsage(400, 10_500) // BATCH_SIZE is 10 000
    await addUsage(1, 3)
    expect((await purgeExpiredLogs()).usage).toBe(10_500)
    expect(await count('usage_log')).toBe(3)
  })

  it('is idempotent', async () => {
    await addUsage(400, 5)
    await purgeExpiredLogs()
    expect((await purgeExpiredLogs()).usage).toBe(0)
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({ query: vi.fn(), rows: {} as Record<string, unknown> }))
vi.mock('@/lib/db', () => ({ query: db.query }))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn(async () => {}) }))

import { getAllSettings, getSetting, invalidateSettings, SETTINGS_TTL_MS, updateSetting } from '@/lib/settings'
import { logAudit } from '@/lib/audit'

beforeEach(() => {
  vi.useFakeTimers()
  invalidateSettings()
  db.rows = { general: { maintenanceMode: false }, features: { text: true } }
  db.query.mockReset()
  db.query.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (sql.startsWith('SELECT value')) {
      const key = params?.[0] as string
      return { rows: key in db.rows ? [{ value: db.rows[key] }] : [], rowCount: key in db.rows ? 1 : 0 }
    }
    if (sql.startsWith('SELECT key, value')) {
      const rows = Object.entries(db.rows).map(([key, value]) => ({ key, value }))
      return { rows, rowCount: rows.length }
    }
    if (sql.includes('INSERT INTO site_settings')) {
      db.rows[params?.[0] as string] = JSON.parse(params?.[1] as string)
      return { rows: [], rowCount: 1 }
    }
    throw new Error('unexpected query: ' + sql)
  })
})
afterEach(() => { vi.useRealTimers() })

describe('getSetting', () => {
  it('reads the database once, then serves the cache', async () => {
    expect(await getSetting('general')).toEqual({ maintenanceMode: false })
    expect(await getSetting('general')).toEqual({ maintenanceMode: false })
    expect(db.query).toHaveBeenCalledTimes(1)
  })

  it('reads again once the TTL has elapsed', async () => {
    await getSetting('general')
    db.rows.general = { maintenanceMode: true }
    vi.advanceTimersByTime(SETTINGS_TTL_MS - 1)
    expect(await getSetting('general')).toEqual({ maintenanceMode: false }) // still cached
    vi.advanceTimersByTime(2)
    expect(await getSetting('general')).toEqual({ maintenanceMode: true })
    expect(db.query).toHaveBeenCalledTimes(2)
  })

  it('returns an empty object for an unknown key, and caches that too', async () => {
    expect(await getSetting('nope')).toEqual({})
    expect(await getSetting('nope')).toEqual({})
    expect(db.query).toHaveBeenCalledTimes(1)
  })

  it('gives each caller its own copy', async () => {
    const a = await getSetting<{ maintenanceMode: boolean }>('general')
    a.maintenanceMode = true
    expect(await getSetting('general')).toEqual({ maintenanceMode: false })
  })

  it('shares one query between simultaneous reads of the same key', async () => {
    await Promise.all([getSetting('general'), getSetting('general'), getSetting('general')])
    expect(db.query).toHaveBeenCalledTimes(1)
  })

  it('does not cache a failed read', async () => {
    db.query.mockRejectedValueOnce(new Error('connection refused'))
    await expect(getSetting('general')).rejects.toThrow('connection refused')
    expect(await getSetting('general')).toEqual({ maintenanceMode: false })
  })
})

describe('updateSetting', () => {
  it('is visible to the next read immediately, not after the TTL', async () => {
    await getSetting('general')
    await updateSetting('general', { maintenanceMode: true }, 'u1', 'a@x.ch')
    expect(await getSetting('general')).toEqual({ maintenanceMode: true })
    expect(logAudit).toHaveBeenCalledWith('u1', 'a@x.ch', 'UPDATE_SETTINGS', 'settings:general', { maintenanceMode: true })
  })

  it('does not let a read started before the write put the old value back in the cache', async () => {
    let release!: () => void
    const gate = new Promise<void>(r => { release = r })
    const original = db.query.getMockImplementation()!
    db.query.mockImplementationOnce(async (sql: string, params?: unknown[]) => {
      const before = await original(sql, params) // the old value, read before the update
      await gate
      return before
    })
    const slowRead = getSetting('general')
    await updateSetting('general', { maintenanceMode: true }, 'u1', 'a@x.ch')
    release()
    await slowRead
    expect(await getSetting('general')).toEqual({ maintenanceMode: true })
  })
})

describe('getAllSettings', () => {
  it('always reads the database, and fills the cache for the next getSetting', async () => {
    expect(await getAllSettings()).toEqual(db.rows)
    db.query.mockClear()
    expect(await getSetting('features')).toEqual({ text: true })
    expect(db.query).not.toHaveBeenCalled()

    db.rows.features = { text: false }
    expect(await getAllSettings()).toMatchObject({ features: { text: false } })
  })
})

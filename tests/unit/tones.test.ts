import { beforeEach, describe, expect, it, vi } from 'vitest'

const getSetting = vi.hoisted(() => vi.fn())
vi.mock('@/lib/settings', () => ({ getSetting }))

import { DEFAULT_TONES, getConfiguredTones } from '@/lib/tones'

describe('DEFAULT_TONES', () => {
  it('has the six documented tones, each labelled in EN/FR/DE/IT', () => {
    expect(DEFAULT_TONES.map(t => t.id)).toEqual(['professional', 'casual', 'friendly', 'authoritative', 'empathetic', 'creative'])
    for (const t of DEFAULT_TONES) {
      expect(t.instruction).not.toBe('')
      expect(Object.keys(t.labels).sort()).toEqual(['de', 'en', 'fr', 'it'])
    }
  })
})

describe('getConfiguredTones', () => {
  beforeEach(() => { getSetting.mockReset() })

  it('returns the configured tones', async () => {
    const tones = [{ id: 'x', labels: { en: 'X' }, instruction: 'in x style', enabled: false }]
    getSetting.mockResolvedValue(tones)
    expect(await getConfiguredTones()).toEqual(tones)
    expect(getSetting).toHaveBeenCalledWith('rewrite_tones')
  })

  it('migrates the legacy `label: string` to `labels: { en }`', async () => {
    getSetting.mockResolvedValue([{ id: 'x', label: 'Legacy', instruction: 'in x style' }])
    expect(await getConfiguredTones()).toEqual([{ id: 'x', labels: { en: 'Legacy' }, instruction: 'in x style' }])
  })

  it('leaves tones that already have `labels` untouched', async () => {
    const t = { id: 'x', label: 'old', labels: { en: 'New' }, instruction: 'i' }
    getSetting.mockResolvedValue([t])
    expect(await getConfiguredTones()).toEqual([t])
  })

  it.each([[null], [[]], ['nope']])('falls back to the defaults for %j', async raw => {
    getSetting.mockResolvedValue(raw)
    expect(await getConfiguredTones()).toBe(DEFAULT_TONES)
  })

  it('falls back to the defaults when the database is unreachable', async () => {
    getSetting.mockImplementation(async () => { throw new Error('connection refused') })
    expect(await getConfiguredTones()).toBe(DEFAULT_TONES)
  })
})

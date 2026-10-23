import { beforeEach, describe, expect, it, vi } from 'vitest'
import { channelOf, compareVersions, pickLatest } from '@/lib/version-compare'
import { checkForUpdate, resetUpdateCache } from '@/lib/update-check'

const rel = (tag: string, prerelease = tag.includes('-')) => ({
  tag_name: tag, prerelease, draft: false, html_url: `https://github.com/Mandrhax/Leksis/releases/tag/${tag}`,
})

const RELEASES = [rel('v1.9.0'), rel('v1.10.0-beta.1'), rel('v1.10.0-beta.2'), rel('v1.8.4'), rel('v1.9.0-beta.2')]

function fakeFetch(body: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch
}

beforeEach(() => { resetUpdateCache(); vi.spyOn(console, 'warn').mockImplementation(() => {}) })

describe('compareVersions', () => {
  it('orders like semver: final above its betas, numbers compared as numbers', () => {
    const sorted = ['1.10.0', '1.9.0', '1.10.0-beta.2', '1.10.0-beta.10', '1.10.0-beta.1', 'v1.8.4', '1.9.1']
      .sort(compareVersions)
    expect(sorted).toEqual(['v1.8.4', '1.9.0', '1.9.1', '1.10.0-beta.1', '1.10.0-beta.2', '1.10.0-beta.10', '1.10.0'])
    expect(compareVersions('1.10.0', 'v1.10.0')).toBe(0)
  })

  it('channelOf', () => {
    expect(channelOf('1.10.0-beta.1')).toBe('beta')
    expect(channelOf('1.9.0')).toBe('stable')
  })

  it('a stable installation never sees pre-releases; a beta one sees both', () => {
    expect(pickLatest(RELEASES.map(r => ({ tag: r.tag_name, prerelease: r.prerelease, url: '' })), 'stable')?.tag).toBe('v1.9.0')
    expect(pickLatest(RELEASES.map(r => ({ tag: r.tag_name, prerelease: r.prerelease, url: '' })), 'beta')?.tag).toBe('v1.10.0-beta.2')
  })

  it('ignores tags that are not versions', () => {
    expect(pickLatest([{ tag: 'nightly', prerelease: false, url: '' }, { tag: 'v1.2.3', prerelease: false, url: '' }], 'stable')?.tag).toBe('v1.2.3')
  })
})

describe('checkForUpdate', () => {
  it('reports a newer version of the same channel, with its release notes', async () => {
    const info = await checkForUpdate('1.10.0-beta.1', true, { fetchFn: fakeFetch(RELEASES) })
    expect(info).toMatchObject({
      status: 'available', channel: 'beta', latest: '1.10.0-beta.2',
      url: 'https://github.com/Mandrhax/Leksis/releases/tag/v1.10.0-beta.2',
    })
  })

  it('a stable installation is up to date while only betas are newer', async () => {
    expect((await checkForUpdate('1.9.0', true, { fetchFn: fakeFetch(RELEASES) })).status).toBe('up_to_date')
  })

  it('a beta installation is told about the final release', async () => {
    const info = await checkForUpdate('1.10.0-beta.2', true, { fetchFn: fakeFetch([...RELEASES, rel('v1.10.0')]) })
    expect(info).toMatchObject({ status: 'available', latest: '1.10.0' })
  })

  it('disabled: no network call at all', async () => {
    const f = fakeFetch(RELEASES)
    expect((await checkForUpdate('1.9.0', false, { fetchFn: f })).status).toBe('disabled')
    expect(f).not.toHaveBeenCalled()
  })

  it('asks GitHub at most once a day', async () => {
    const f = fakeFetch(RELEASES)
    const t0 = Date.parse('2026-10-23T10:00:00Z')
    await checkForUpdate('1.9.0', true, { fetchFn: f, now: t0 })
    await checkForUpdate('1.9.0', true, { fetchFn: f, now: t0 + 23 * 3600_000 })
    expect(f).toHaveBeenCalledTimes(1)
    await checkForUpdate('1.9.0', true, { fetchFn: f, now: t0 + 25 * 3600_000 })
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('no Internet access or an odd answer: "unavailable", retried after an hour, never an exception', async () => {
    const t0 = Date.parse('2026-10-23T10:00:00Z')
    const offline = vi.fn(async () => { throw new TypeError('fetch failed') }) as unknown as typeof fetch
    expect((await checkForUpdate('1.9.0', true, { fetchFn: offline, now: t0 })).status).toBe('unavailable')
    expect((await checkForUpdate('1.9.0', true, { fetchFn: offline, now: t0 + 30 * 60_000 })).status).toBe('unavailable')
    expect(offline).toHaveBeenCalledTimes(1)
    expect((await checkForUpdate('1.9.0', true, { fetchFn: fakeFetch(RELEASES), now: t0 + 61 * 60_000 })).status).toBe('up_to_date')
    resetUpdateCache()
    expect((await checkForUpdate('1.9.0', true, { fetchFn: fakeFetch({ message: 'API rate limit exceeded' }, 403) })).status).toBe('unavailable')
    resetUpdateCache()
    expect((await checkForUpdate('1.9.0', true, { fetchFn: fakeFetch({ not: 'a list' }) })).status).toBe('unavailable')
  })

  it('drops drafts and any link that is not a GitHub page', async () => {
    const info = await checkForUpdate('1.9.0', true, {
      fetchFn: fakeFetch([
        { tag_name: 'v2.0.0', prerelease: false, draft: true, html_url: 'https://github.com/x' },
        { tag_name: 'v1.9.1', prerelease: false, draft: false, html_url: 'javascript:alert(1)' },
      ]),
    })
    expect(info).toMatchObject({ status: 'available', latest: '1.9.1' })
    expect(info.url).toBeUndefined()
  })
})

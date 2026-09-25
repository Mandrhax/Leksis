import { beforeEach, describe, expect, it, vi } from 'vitest'

const lookup = vi.hoisted(() => vi.fn())
vi.mock('node:dns/promises', () => ({ lookup }))

import { isExternalHost, isExternalUrl, isPrivateIp } from '@/lib/llm/network'

describe('isPrivateIp', () => {
  it.each([
    '10.1.2.3', '127.0.0.1', '0.0.0.0', '172.16.0.1', '172.31.255.255', '192.168.1.1',
    '169.254.1.1', '100.64.0.1', '100.127.255.255', '::1', '::', 'fd12::1', 'fe80::1', '::ffff:192.168.1.5',
  ])('%s is private', ip => expect(isPrivateIp(ip)).toBe(true))

  it.each([
    '8.8.8.8', '172.15.0.1', '172.32.0.1', '100.63.0.1', '100.128.0.1', '169.253.0.1',
    '2001:4860:4860::8888', '::ffff:8.8.8.8', 'not-an-ip',
  ])('%s is not private', ip => expect(isPrivateIp(ip)).toBe(false))
})

describe('isExternalHost', () => {
  beforeEach(() => { lookup.mockReset() })

  it('treats private IPs, localhost, Docker names and internal suffixes as internal (no DNS)', async () => {
    for (const h of ['192.168.1.5', '[::1]', 'localhost', 'ollama', 'gpu.lan', 'box.internal', 'Printer.LOCAL']) {
      expect(await isExternalHost(h), h).toBe(false)
    }
    expect(lookup).not.toHaveBeenCalled()
  })

  it('treats public IPs and the empty host as external', async () => {
    expect(await isExternalHost('8.8.8.8')).toBe(true)
    expect(await isExternalHost('')).toBe(true)
  })

  it('resolves public names through DNS', async () => {
    lookup.mockResolvedValueOnce([{ address: '10.0.0.9', family: 4 }])
    expect(await isExternalHost('gpu-a.example.org')).toBe(false)
  })

  it('is external as soon as one address is public', async () => {
    lookup.mockResolvedValueOnce([{ address: '10.0.0.9', family: 4 }, { address: '93.184.216.34', family: 4 }])
    expect(await isExternalHost('gpu-b.example.org')).toBe(true)
  })

  it('fails closed when DNS fails', async () => {
    lookup.mockRejectedValueOnce(new Error('ENOTFOUND'))
    expect(await isExternalHost('gpu-c.example.org')).toBe(true)
  })

  it('caches DNS answers', async () => {
    lookup.mockResolvedValue([{ address: '10.0.0.9', family: 4 }])
    await isExternalHost('gpu-d.example.org')
    await isExternalHost('gpu-d.example.org')
    expect(lookup).toHaveBeenCalledTimes(1)
  })
})

describe('isExternalUrl', () => {
  it('reads the hostname of a URL', async () => {
    expect(await isExternalUrl('http://192.168.1.5:11434')).toBe(false)
    expect(await isExternalUrl('https://8.8.8.8/v1')).toBe(true)
  })
  it('treats an invalid URL as external', async () => {
    expect(await isExternalUrl('not a url')).toBe(true)
  })
})

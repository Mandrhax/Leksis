import { describe, expect, it } from 'vitest'
import {
  cleanTrustedProxies, generateCaddyfile, isDomainName, normalizeCaddyConfig, resolveCaddyConfig,
} from '@/lib/caddy-config'

describe('isDomainName', () => {
  it('accepts domain names', () => {
    expect(isDomainName('leksis.example.com')).toBe(true)
    expect(isDomainName(' Example.CH ')).toBe(true)
  })
  it('rejects IP addresses, single labels and garbage', () => {
    for (const v of ['192.168.1.10', 'localhost', '', 'a b.com', 'http://x.com', '-x.com']) {
      expect(isDomainName(v), v).toBe(false)
    }
  })
})

describe('cleanTrustedProxies', () => {
  it('splits on spaces and commas', () => {
    expect(cleanTrustedProxies('10.0.0.1, 192.168.0.0/16  ::1')).toBe('10.0.0.1 192.168.0.0/16 ::1')
  })
  it('accepts an empty list', () => {
    expect(cleanTrustedProxies('')).toBe('')
  })
  it('rejects invalid entries', () => {
    expect(cleanTrustedProxies('10.0.0.1 proxy.example.com')).toBeNull()
    expect(cleanTrustedProxies('10.0.0.1; rm -rf')).toBeNull()
  })
})

describe('resolveCaddyConfig', () => {
  it('keeps a saved mode', () => {
    expect(resolveCaddyConfig({ mode: 'proxy', trustedProxies: ' 10.0.0.1 ' })).toEqual({
      mode: 'proxy', host: '', keepHttpFallback: true, trustedProxies: '10.0.0.1',
    })
    expect(resolveCaddyConfig({ mode: 'https', host: 'a.example.com', keepHttpFallback: false }).keepHttpFallback).toBe(false)
  })
  it('migrates the legacy { host, behindProxy } format', () => {
    expect(resolveCaddyConfig({ host: 'a.example.com' }).mode).toBe('https')
    expect(resolveCaddyConfig({ behindProxy: true }).mode).toBe('proxy')
    expect(resolveCaddyConfig({}).mode).toBe('http')
  })
  it('falls back to CADDY_HOST when nothing was saved', () => {
    expect(resolveCaddyConfig({}, 'leksis.example.com')).toMatchObject({ mode: 'https', host: 'leksis.example.com' })
    expect(resolveCaddyConfig({}, '10.0.0.5').mode).toBe('http')
  })
})

describe('normalizeCaddyConfig', () => {
  it('requires a domain name in https mode', () => {
    expect(normalizeCaddyConfig({ mode: 'https', host: '10.0.0.5' })).toEqual({ error: 'invalid_domain' })
    expect(normalizeCaddyConfig({ mode: 'https', host: 'Leksis.Example.com ' })).toMatchObject({
      config: { mode: 'https', host: 'leksis.example.com' },
    })
  })
  it('validates proxy addresses only in proxy mode', () => {
    expect(normalizeCaddyConfig({ mode: 'proxy', trustedProxies: 'nope!' })).toEqual({ error: 'invalid_proxy' })
    expect(normalizeCaddyConfig({ mode: 'http', trustedProxies: 'nope!' })).toMatchObject({ config: { trustedProxies: '' } })
  })
  it('drops the host outside https mode', () => {
    expect(normalizeCaddyConfig({ mode: 'http', host: 'a.example.com' })).toMatchObject({ config: { host: '' } })
  })
})

describe('generateCaddyfile', () => {
  const base = { host: '', keepHttpFallback: true, trustedProxies: '' }

  it('http: single :80 block with compression', () => {
    const f = generateCaddyfile({ ...base, mode: 'http' })
    expect(f).toContain(':80 {')
    expect(f).toContain('encode gzip')
    expect(f).toContain('trusted_proxies static private_ranges')
    expect(f).toContain('reverse_proxy app:3000')
    expect(f).toContain('max_size 50MB')
  })
  it('proxy: no compression (the upstream proxy handles it), extra trusted proxies appended', () => {
    const f = generateCaddyfile({ ...base, mode: 'proxy', trustedProxies: '203.0.113.7' })
    expect(f).not.toContain('encode gzip')
    expect(f).toContain('trusted_proxies static private_ranges 203.0.113.7')
  })
  it('https: domain block, plus a :80 fallback unless disabled', () => {
    const cfg = { ...base, mode: 'https' as const, host: 'leksis.example.com' }
    const withFallback = generateCaddyfile(cfg)
    expect(withFallback).toContain('leksis.example.com {')
    expect(withFallback).toContain(':80 {')
    const without = generateCaddyfile({ ...cfg, keepHttpFallback: false })
    expect(without).toContain('leksis.example.com {')
    expect(without).not.toContain(':80 {')
  })
  it('never emits the empty X-Forwarded-* override', () => {
    expect(generateCaddyfile({ ...base, mode: 'http' })).not.toContain('X-Forwarded')
  })
})

import { describe, expect, it } from 'vitest'
import { pickPublicOrigin } from '@/lib/public-origin'

describe('pickPublicOrigin', () => {
  it('uses the configured domain in https mode, ignoring a forged Host header', () => {
    const cfg = { mode: 'https' as const, host: 'leksis.acme.ch', keepHttpFallback: true, trustedProxies: '' }
    expect(pickPublicOrigin(cfg, 'http://evil.example')).toBe('https://leksis.acme.ch')
  })

  it('falls back to the request origin when no domain is configured (http / proxy modes)', () => {
    const http = { mode: 'http' as const, host: '', keepHttpFallback: true, trustedProxies: '' }
    const proxy = { mode: 'proxy' as const, host: '', keepHttpFallback: true, trustedProxies: '' }
    expect(pickPublicOrigin(http, 'http://10.0.0.5')).toBe('http://10.0.0.5')
    expect(pickPublicOrigin(proxy, 'https://leksis.acme.ch')).toBe('https://leksis.acme.ch')
  })

  it('does not trust an invalid saved domain in https mode', () => {
    const cfg = { mode: 'https' as const, host: 'not a domain', keepHttpFallback: true, trustedProxies: '' }
    expect(pickPublicOrigin(cfg, 'http://10.0.0.5')).toBe('http://10.0.0.5')
  })
})

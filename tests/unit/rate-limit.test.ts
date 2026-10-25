import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkRateLimit, getClientIp, getRequestOrigin } from '@/lib/rate-limit'

afterEach(() => { vi.useRealTimers() })

const req = (headers: Record<string, string>) => new Request('http://app:3000/x', { headers })

describe('getClientIp', () => {
  it('uses X-Real-IP set by Caddy ({client_ip}), never the first X-Forwarded-For entry chosen by the client', () => {
    expect(getClientIp(req({ 'x-real-ip': '192.168.1.20', 'x-forwarded-for': '1.2.3.4, 192.168.1.20' }))).toBe('192.168.1.20')
  })
  it('without X-Real-IP, the last X-Forwarded-For hop', () => {
    expect(getClientIp(req({ 'x-forwarded-for': '1.2.3.4, 10.0.0.7' }))).toBe('10.0.0.7')
  })
  it('unknown when neither is present', () => {
    expect(getClientIp(req({}))).toBe('unknown')
  })
})

describe('checkRateLimit', () => {
  it('allows `limit` calls per window, then refuses with the wait time', () => {
    vi.useFakeTimers()
    const key = `t-${Math.random()}`
    expect(checkRateLimit(key, 2).ok).toBe(true)
    expect(checkRateLimit(key, 2).ok).toBe(true)
    const refused = checkRateLimit(key, 2)
    expect(refused).toMatchObject({ ok: false })
    expect(refused.ok === false && refused.retryAfterSec).toBeGreaterThan(0)
    vi.advanceTimersByTime(60_001)
    expect(checkRateLimit(key, 2).ok).toBe(true)
  })
  it('limit 0 = unlimited', () => {
    const key = `t-${Math.random()}`
    for (let i = 0; i < 100; i++) expect(checkRateLimit(key, 0).ok).toBe(true)
  })
})

describe('getRequestOrigin', () => {
  it('rebuilds the public origin from the headers forwarded by Caddy', () => {
    expect(getRequestOrigin(req({ 'x-forwarded-proto': 'https', 'x-forwarded-host': 'leksis.example.com' }))).toBe('https://leksis.example.com')
    expect(getRequestOrigin(req({ host: '192.168.1.5' }))).toBe('http://192.168.1.5')
  })
})

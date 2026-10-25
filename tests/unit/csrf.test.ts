import { describe, expect, it } from 'vitest'
import { isCrossSiteRequest } from '@/lib/csrf'

const h = (values: Record<string, string>) => new Headers(values)

describe('isCrossSiteRequest', () => {
  it('trusts Sec-Fetch-Site when the browser sends it', () => {
    expect(isCrossSiteRequest(h({ 'sec-fetch-site': 'same-origin' }))).toBe(false)
    expect(isCrossSiteRequest(h({ 'sec-fetch-site': 'none' }))).toBe(false)
    expect(isCrossSiteRequest(h({ 'sec-fetch-site': 'same-site', origin: 'https://intranet.corp.local' }))).toBe(true)
    expect(isCrossSiteRequest(h({ 'sec-fetch-site': 'cross-site' }))).toBe(true)
  })
  it('plain HTTP on a LAN address (no Sec-Fetch-*): compares Origin with the requested host', () => {
    expect(isCrossSiteRequest(h({ origin: 'http://192.168.1.50', host: '192.168.1.50' }))).toBe(false)
    expect(isCrossSiteRequest(h({ origin: 'http://192.168.1.50:8080', host: '192.168.1.50' }))).toBe(true)
    expect(isCrossSiteRequest(h({ origin: 'http://localhost:3000', host: 'localhost:3000' }))).toBe(false)
  })
  it('prefers the host forwarded by Caddy', () => {
    expect(isCrossSiteRequest(h({ origin: 'https://leksis.example.com', host: 'app:3000', 'x-forwarded-host': 'leksis.example.com' }))).toBe(false)
  })
  it('refuses an opaque or unreadable Origin', () => {
    expect(isCrossSiteRequest(h({ origin: 'null', host: 'leksis.example.com' }))).toBe(true)
  })
  it('lets non-browser clients through (no Origin, no Sec-Fetch-Site)', () => {
    expect(isCrossSiteRequest(h({ host: 'leksis.example.com' }))).toBe(false)
  })
})

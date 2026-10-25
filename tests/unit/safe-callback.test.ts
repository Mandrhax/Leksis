import { describe, expect, it } from 'vitest'
import { safeCallbackPath } from '@/lib/safe-callback'

const origin = 'https://leksis.example.com'

describe('safeCallbackPath', () => {
  it('keeps only the path of an internal absolute URL', () => {
    expect(safeCallbackPath('http://0.0.0.0:3000/admin/users?page=2#top', origin)).toBe('/admin/users?page=2#top')
  })
  it('keeps a relative path', () => {
    expect(safeCallbackPath('/settings', origin)).toBe('/settings')
  })
  it('never returns a protocol-relative path to another host', () => {
    expect(safeCallbackPath('https://x//evil.com/a', origin)).toBe('/')
    expect(safeCallbackPath('/.//evil.com', origin)).toBe('/')
    expect(safeCallbackPath('//evil.com', origin)).toBe('/')
    expect(safeCallbackPath('/\\evil.com', origin)).toBe('/')
  })
  it('falls back to / on garbage', () => {
    expect(safeCallbackPath('http://[', origin)).toBe('/')
  })
})

import { describe, expect, it } from 'vitest'
import { emailDomain, isEmailDomainAllowed } from '@/lib/email-domains'

describe('emailDomain', () => {
  it('returns the lowercased domain', () => {
    expect(emailDomain('Bob@ACME.ch')).toBe('acme.ch')
  })
  it('returns null for malformed addresses', () => {
    for (const bad of ['', null, undefined, 'noat', '@x.ch', 'a@', 'a@b@c.ch']) expect(emailDomain(bad)).toBeNull()
  })
})

describe('isEmailDomainAllowed', () => {
  it('allows everything when the list is empty', () => {
    expect(isEmailDomainAllowed('a@anywhere.com', '')).toBe(true)
    expect(isEmailDomainAllowed('a@anywhere.com', '  , ')).toBe(true)
  })
  it('allows several listed domains, case-insensitively', () => {
    const list = 'acme.ch, @Acme.com'
    expect(isEmailDomainAllowed('a@acme.ch', list)).toBe(true)
    expect(isEmailDomainAllowed('a@ACME.COM', list)).toBe(true)
    expect(isEmailDomainAllowed('a@other.org', list)).toBe(false)
  })
  it('requires the exact domain: no suffix, no sub-domain, no embedded @', () => {
    expect(isEmailDomainAllowed('a@evilacme.ch', 'acme.ch')).toBe(false)
    expect(isEmailDomainAllowed('a@acme.ch.evil.com', 'acme.ch')).toBe(false)
    expect(isEmailDomainAllowed('a@mail.acme.ch', 'acme.ch')).toBe(false)
    expect(isEmailDomainAllowed('a@x.com@acme.ch', 'acme.ch')).toBe(false)
  })
  it('refuses a malformed address when a list is set', () => {
    expect(isEmailDomainAllowed('nonsense', 'acme.ch')).toBe(false)
  })
})

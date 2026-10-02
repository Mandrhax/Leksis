import { describe, expect, it } from 'vitest'
import { isOidcIdentityAccepted, parseAllowedDomains } from '@/lib/oidc-access'

describe('parseAllowedDomains', () => {
  it('splits on commas, spaces and newlines, lowercases and strips a leading @', () => {
    expect(parseAllowedDomains('Acme.ch, @sub.acme.ch\nfoo.org  ')).toEqual(['acme.ch', 'sub.acme.ch', 'foo.org'])
  })

  it('returns an empty list for an empty string', () => {
    expect(parseAllowedDomains('  ')).toEqual([])
  })
})

describe('isOidcIdentityAccepted', () => {
  it('accepts any domain when the list is empty', () => {
    expect(isOidcIdentityAccepted({ email: 'a@anywhere.com', emailVerified: true, allowedDomains: '' })).toBe(true)
  })

  it('accepts only the listed domains, exactly (no suffix trick)', () => {
    const allowedDomains = 'acme.ch'
    expect(isOidcIdentityAccepted({ email: 'a@acme.ch', emailVerified: true, allowedDomains })).toBe(true)
    expect(isOidcIdentityAccepted({ email: 'a@ACME.CH', emailVerified: true, allowedDomains })).toBe(true)
    expect(isOidcIdentityAccepted({ email: 'a@evilacme.ch', emailVerified: true, allowedDomains })).toBe(false)
    expect(isOidcIdentityAccepted({ email: 'a@acme.ch.evil.com', emailVerified: true, allowedDomains })).toBe(false)
    expect(isOidcIdentityAccepted({ email: 'a@x.com@acme.ch', emailVerified: true, allowedDomains })).toBe(false)
  })

  it('rejects an identity whose email the provider says is NOT verified', () => {
    expect(isOidcIdentityAccepted({ email: 'a@acme.ch', emailVerified: false, allowedDomains: '' })).toBe(false)
  })

  it('accepts a provider that does not send email_verified at all (e.g. Entra ID)', () => {
    expect(isOidcIdentityAccepted({ email: 'a@acme.ch', emailVerified: undefined, allowedDomains: '' })).toBe(true)
  })

  it('rejects a missing email', () => {
    expect(isOidcIdentityAccepted({ email: '', emailVerified: true, allowedDomains: '' })).toBe(false)
  })
})

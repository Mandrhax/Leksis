import { describe, expect, it } from 'vitest'
import { resolveUILocale } from '@/lib/ui-locale'

describe('resolveUILocale', () => {
  it('the language the user picked (cookie) wins', () => {
    expect(resolveUILocale('it', 'fr-CH,fr;q=0.9')).toBe('it')
  })
  it('otherwise the first supported browser language, by preference', () => {
    expect(resolveUILocale(undefined, 'fr-CH,fr;q=0.9,en;q=0.8')).toBe('fr')
    expect(resolveUILocale(undefined, 'es-ES,es;q=0.9,de;q=0.8,en;q=0.7')).toBe('de')
    expect(resolveUILocale(undefined, 'en;q=0.5,de-CH;q=0.9')).toBe('de')
  })
  it('falls back to English (unknown cookie, unsupported or missing header)', () => {
    expect(resolveUILocale('xx', 'es,pt')).toBe('en')
    expect(resolveUILocale(null, null)).toBe('en')
    expect(resolveUILocale(undefined, 'fr;q=0')).toBe('en')
  })
})

import { describe, expect, it } from 'vitest'
import { LANGUAGES, detectLanguage, resolveLanguageCode, sameBaseLanguage } from '@/lib/languages'

describe('LANGUAGES', () => {
  // L'ordre alphabétique est appliqué par LanguageDropdown à l'affichage
  it('has unique codes', () => {
    expect(new Set(LANGUAGES.map(l => l.code)).size).toBe(LANGUAGES.length)
  })
})

describe('sameBaseLanguage', () => {
  it('same base language, regional variants included', () => {
    expect(sameBaseLanguage('fr', 'fr-CH')).toBe(true)
    expect(sameBaseLanguage('en-GB', 'en')).toBe(true)
    expect(sameBaseLanguage('fr', 'de')).toBe(false)
  })
  it('simplified ↔ traditional Chinese is a real conversion; auto or empty is unknown', () => {
    expect(sameBaseLanguage('zh-Hans', 'zh-Hant')).toBe(false)
    expect(sameBaseLanguage('auto', 'fr')).toBe(false)
    expect(sameBaseLanguage('', 'fr')).toBe(false)
  })
})

describe('detectLanguage', () => {
  it('recognises common languages from a sentence', () => {
    expect(detectLanguage('Le contrat est signé par les deux parties et il entre en vigueur demain.')?.code).toBe('fr')
    expect(detectLanguage('Der Vertrag wird von beiden Parteien unterschrieben und ist ab morgen gültig.')?.code).toBe('de')
    expect(detectLanguage('The contract is signed by both parties and it takes effect tomorrow.')?.code).toBe('en')
  })
  it('says nothing for a text too short to tell', () => {
    expect(detectLanguage('ok')).toBeNull()
  })
})

describe('resolveLanguageCode', () => {
  it('maps any casing to the official code, unknown → null', () => {
    expect(resolveLanguageCode('FR-ch')).toBe('fr-CH')
    expect(resolveLanguageCode('zh-hant')).toBe('zh-Hant')
    expect(resolveLanguageCode('xx')).toBeNull()
  })
})

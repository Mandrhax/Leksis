import { describe, expect, it } from 'vitest'
import { detectRegister, hasFormalAddress } from '@/lib/register-detect'

describe('hasFormalAddress', () => {
  it('is true for target languages that distinguish tu / vous, regional variants included', () => {
    for (const code of ['fr', 'fr-CH', 'de', 'de-CH', 'it', 'es', 'es-MX', 'pt-BR', 'nl', 'ru']) expect(hasFormalAddress(code)).toBe(true)
  })
  it('is false for English and languages without the distinction', () => {
    for (const code of ['en', 'en-GB', 'zh-Hans', 'ja', 'ar', '', undefined]) expect(hasFormalAddress(code)).toBe(false)
  })
})

describe('detectRegister', () => {
  it.each([
    ['fr', 'Est-ce que tu peux m’envoyer le rapport ?', 'Informal'],
    ['fr', 'Je t’envoie le rapport demain.', 'Informal'],
    ['fr', 'Pourriez-vous m’envoyer votre rapport ?', 'Formal'],
    ['fr-CH', 'Merci de nous retourner vos documents.', 'Formal'],
    ['de', 'Kannst du mir den Bericht schicken?', 'Informal'],
    ['de', 'Könnten Sie mir bitte Ihren Bericht schicken?', 'Formal'],
    ['de-CH', 'Sehr geehrte Damen und Herren,\nSie erhalten anbei die Unterlagen.', 'Formal'],
    ['it', 'Puoi mandarmi il tuo rapporto?', 'Informal'],
    ['it', 'Potrebbe inviarmi il Suo rapporto, se Lei è d’accordo?', 'Formal'],
    ['es', '¿Puedes enviarme tu informe?', 'Informal'],
    ['es', '¿Podría usted enviarme el informe?', 'Formal'],
    ['nl', 'Kun je mij jouw rapport sturen?', 'Informal'],
    ['nl', 'Kunt u mij uw rapport sturen?', 'Formal'],
  ] as const)('%s: %s → %s', (lang, text, expected) => {
    expect(detectRegister(text, lang)).toBe(expected)
  })

  it('returns null when the text does not address the reader', () => {
    expect(detectRegister('Le rapport annuel est disponible.', 'fr')).toBeNull()
    expect(detectRegister('Der Bericht ist fertig.', 'de')).toBeNull()
  })

  it('does not take ambiguous words for a form of address', () => {
    expect(detectRegister('Le ton du document est neutre.', 'fr')).toBeNull()             // « ton » the noun
    expect(detectRegister('Sie ist heute nicht im Büro.', 'de')).toBeNull()               // she, sentence start
    expect(detectRegister('Ich habe sie gestern gesehen.', 'de')).toBeNull()              // her, lowercase
    expect(detectRegister('Lei è arrivata ieri a La Spezia.', 'it')).toBeNull()           // she, sentence start
  })

  it('an informal mark wins over a polite form that may be a plural', () => {
    expect(detectRegister('Tu viens avec nous ? Vous êtes tous invités.', 'fr')).toBe('Informal')
  })

  it('cannot tell for English, an unknown or an uncovered source', () => {
    expect(detectRegister('Could you send me your report?', 'en')).toBeNull()
    expect(detectRegister('Est-ce que tu viens ?', 'auto')).toBeNull()
    expect(detectRegister('Czy możesz mi wysłać raport?', 'pl')).toBeNull()
  })
})

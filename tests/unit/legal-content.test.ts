import { describe, expect, it } from 'vitest'
import {
  buildPrivacyPolicy, buildUsagePolicy, textToParagraphs, type LegalContext, type LegalDocument,
} from '@/lib/legal-content'
import { parseSetting } from '@/lib/settings-schema'

const BASE: LegalContext = {
  siteName: 'Leksis',
  organization: '',
  contact: '',
  privacyNotes: '',
  usageRules: '',
  usageRetentionDays: 365,
  auditRetentionDays: 730,
  aiScope: 'local',
  features: { text: true, document: true, image: true, rewrite: true },
  limits: { maxTextChars: 5000, maxDocChars: 12000, maxImageMB: 10, rateLimitPerMin: 30 },
}

const ctx = (over: Partial<LegalContext> = {}): LegalContext => ({ ...BASE, ...over })

/** Tout le texte d'un document, pour les recherches par sous-chaîne. */
function flat(doc: LegalDocument): string {
  return [doc.title, doc.intro, ...doc.sections.flatMap(s => [s.title, ...(s.paragraphs ?? []), ...(s.items ?? [])])].join('\n')
}

const section = (doc: LegalDocument, id: string) => doc.sections.find(s => s.id === id)

describe('privacy policy — where content goes', () => {
  it('says the content stays on this server with the local AI', () => {
    const s = section(buildPrivacyPolicy(ctx({ aiScope: 'local' })), 'ai-processing')!
    expect(s.warning).toBeUndefined()
    expect(s.paragraphs!.join(' ')).toContain('never leave')
  })

  it('says the content stays on the private network with a private AI server', () => {
    const s = section(buildPrivacyPolicy(ctx({ aiScope: 'private' })), 'ai-processing')!
    expect(s.warning).toBeUndefined()
    expect(s.paragraphs!.join(' ')).toContain('private network')
  })

  it('warns explicitly when the AI server is external', () => {
    const s = section(buildPrivacyPolicy(ctx({ aiScope: 'external' })), 'ai-processing')!
    expect(s.warning).toBe(true)
    expect(s.paragraphs!.join(' ')).toContain('external service')
    expect(s.paragraphs!.join(' ')).toContain('leave the organisation')
  })
})

describe('privacy policy — retention', () => {
  it('reads the configured number of days', () => {
    const text = flat(buildPrivacyPolicy(ctx({ usageRetentionDays: 90, auditRetentionDays: 1 })))
    expect(text).toContain('Usage log entries are deleted automatically after 90 days.')
    expect(text).toContain('Audit log entries are deleted automatically after 1 day.')
  })

  it('says entries are kept until deleted when retention is 0', () => {
    const text = flat(buildPrivacyPolicy(ctx({ usageRetentionDays: 0, auditRetentionDays: 0 })))
    expect(text).toContain('Usage log entries are kept until an administrator deletes them.')
    expect(text).toContain('Audit log entries are kept until an administrator deletes them.')
  })
})

describe('privacy policy — organisation and contact', () => {
  it('uses generic wording without an organisation or contact', () => {
    const text = flat(buildPrivacyPolicy(ctx()))
    expect(text).toContain('the organisation that operates this service')
    expect(text).toContain('contact your administrator')
  })

  it('names the organisation and the contact when set', () => {
    const text = flat(buildPrivacyPolicy(ctx({ organization: 'Acme SA', contact: 'privacy@acme.ch' })))
    expect(text).toContain('operated by Acme SA')
    expect(text).toContain('contact privacy@acme.ch')
    expect(text).not.toContain('contact your administrator')
  })

  it('uses the site name', () => {
    expect(flat(buildPrivacyPolicy(ctx({ siteName: 'TradPro' })))).toContain('TradPro')
  })

  it('appends the admin notes as an extra section, paragraph by paragraph', () => {
    const doc = buildPrivacyPolicy(ctx({ organization: 'Acme SA', privacyNotes: 'First.\n\nSecond.' }))
    const last = doc.sections[doc.sections.length - 1]
    expect(last.id).toBe('additional')
    expect(last.title).toBe('Additional information from Acme SA')
    expect(last.paragraphs).toEqual(['First.', 'Second.'])
  })

  it('has no extra section without notes', () => {
    expect(section(buildPrivacyPolicy(ctx()), 'additional')).toBeUndefined()
  })

  it('states that the content itself is never logged', () => {
    expect(flat(buildPrivacyPolicy(ctx()))).toContain('The content itself is never recorded.')
  })
})

describe('usage policy', () => {
  it('lists only the enabled features', () => {
    const text = section(buildUsagePolicy(ctx({ features: { text: true, document: false, image: false, rewrite: true } })), 'purpose')!
      .paragraphs!.join(' ')
    expect(text).toContain('text translation')
    expect(text).toContain('rewriting')
    expect(text).not.toContain('document translation')
    expect(text).not.toContain('OCR')
  })

  it('says no feature is enabled when all are off', () => {
    const doc = buildUsagePolicy(ctx({ features: { text: false, document: false, image: false, rewrite: false } }))
    expect(flat(doc)).toContain('No feature is enabled')
  })

  it('states the configured limits', () => {
    const items = section(buildUsagePolicy(ctx({ limits: { maxTextChars: 8000, maxDocChars: 20000, maxImageMB: 5, rateLimitPerMin: 12 } })), 'limits')!.items!.join('\n')
    expect(items).toContain('8,000 characters')
    expect(items).toContain('20,000 characters')
    expect(items).toContain('5 MB per image')
    expect(items).toContain('12 AI requests per minute')
  })

  it('says there is no rate limit when it is 0', () => {
    const items = section(buildUsagePolicy(ctx({ limits: { ...BASE.limits, rateLimitPerMin: 0 } })), 'limits')!.items!.join('\n')
    expect(items).toContain('no per-minute limit')
  })

  it('warns about confidential data when the AI server is external', () => {
    const s = section(buildUsagePolicy(ctx({ aiScope: 'external' })), 'confidentiality')!
    expect(s.warning).toBe(true)
    expect(s.paragraphs!.join(' ')).toContain('external AI service')
  })

  it('does not warn when the content stays inside the organisation', () => {
    for (const aiScope of ['local', 'private'] as const) {
      const s = section(buildUsagePolicy(ctx({ aiScope })), 'confidentiality')!
      expect(s.warning).toBeUndefined()
      expect(s.paragraphs!.join(' ')).toContain('stays within the infrastructure')
    }
  })

  it('appends the additional rules before the contact section', () => {
    const doc = buildUsagePolicy(ctx({ usageRules: 'No client names.' }))
    const ids = doc.sections.map(s => s.id)
    expect(ids.slice(-2)).toEqual(['additional', 'contact'])
    expect(section(doc, 'additional')!.paragraphs).toEqual(['No client names.'])
  })
})

describe('generated documents', () => {
  it.each(['local', 'private', 'external'] as const)('have unique section ids and no empty section (%s)', aiScope => {
    for (const doc of [buildPrivacyPolicy(ctx({ aiScope })), buildUsagePolicy(ctx({ aiScope }))]) {
      const ids = doc.sections.map(s => s.id)
      expect(new Set(ids).size).toBe(ids.length)
      for (const s of doc.sections) expect((s.paragraphs?.length ?? 0) + (s.items?.length ?? 0)).toBeGreaterThan(0)
    }
  })
})

describe('textToParagraphs', () => {
  it('splits on blank lines and joins the lines of a paragraph', () => {
    expect(textToParagraphs('a\nb\n\n\nc')).toEqual(['a b', 'c'])
  })

  it('handles Windows line endings and blank input', () => {
    expect(textToParagraphs('a\r\n\r\nb')).toEqual(['a', 'b'])
    expect(textToParagraphs('  \n \n')).toEqual([])
    expect(textToParagraphs('')).toEqual([])
  })

  it('keeps HTML as plain text (React escapes it when rendering)', () => {
    expect(textToParagraphs('<script>x</script>')).toEqual(['<script>x</script>'])
  })
})

describe('legal setting schema', () => {
  it('accepts the four fields and drops unknown keys', () => {
    const r = parseSetting('legal', { organization: 'Acme', contact: 'a@b.ch', privacyNotes: 'x', usageRules: 'y', extra: 1 })
    expect(r).toEqual({ ok: true, value: { organization: 'Acme', contact: 'a@b.ch', privacyNotes: 'x', usageRules: 'y' } })
  })

  it('rejects oversized text', () => {
    expect(parseSetting('legal', { privacyNotes: 'x'.repeat(5001) }).ok).toBe(false)
    expect(parseSetting('legal', { organization: 'x'.repeat(121) }).ok).toBe(false)
  })
})

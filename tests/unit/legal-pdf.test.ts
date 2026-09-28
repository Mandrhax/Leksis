import { describe, expect, it } from 'vitest'
import { generateLegalPdf } from '@/lib/legal-pdf'
import { buildPrivacyPolicy, buildUsagePolicy, type LegalContext } from '@/lib/legal-content'

const ctx: LegalContext = {
  siteName: 'Leksis',
  organization: 'Acme SA',
  contact: 'privacy@acme.ch',
  privacyNotes: '',
  usageRules: '',
  usageRetentionDays: 365,
  auditRetentionDays: 730,
  aiScope: 'external', // exerce aussi le rendu des sections d'avertissement
  features: { text: true, document: true, image: true, rewrite: true },
  limits: { maxTextChars: 5000, maxDocChars: 12000, maxImageMB: 10, rateLimitPerMin: 30 },
}

const LOCALES = ['en', 'de', 'fr', 'it'] as const

describe('generateLegalPdf', () => {
  it.each(LOCALES)('produces a valid PDF for the privacy policy in %s', async locale => {
    const doc = buildPrivacyPolicy(ctx, locale)
    const bytes = await generateLegalPdf(doc, { siteName: ctx.siteName, version: '2026-09-28', locale })
    expect(bytes.byteLength).toBeGreaterThan(500)
    expect(Buffer.from(bytes.slice(0, 5)).toString('latin1')).toBe('%PDF-')
  })

  it.each(LOCALES)('produces a valid PDF for the usage policy in %s', async locale => {
    const doc = buildUsagePolicy(ctx, locale)
    const bytes = await generateLegalPdf(doc, { siteName: ctx.siteName, version: '2026-09-28', locale })
    expect(bytes.byteLength).toBeGreaterThan(500)
    expect(Buffer.from(bytes.slice(0, 5)).toString('latin1')).toBe('%PDF-')
  })

  it('renders accented characters correctly (round-trip through a real PDF text extraction)', async () => {
    const { PDFParse } = await import('pdf-parse') as {
      PDFParse: new (opts: { data: Buffer }) => { getText(): Promise<{ text: string }> }
    }
    const checks: Record<typeof LOCALES[number], string> = {
      en: 'Federal Data Protection and Information Commissioner',
      fr: 'Préposé fédéral à la protection des données',
      de: 'Öffentlichkeitsbeauftragten',
      it: 'autorità nazionale',
    }
    for (const locale of LOCALES) {
      const doc = buildPrivacyPolicy(ctx, locale)
      const bytes = await generateLegalPdf(doc, { siteName: ctx.siteName, version: '2026-09-28', locale })
      const parser = new PDFParse({ data: Buffer.from(bytes) })
      const { text } = await parser.getText()
      // Le texte enveloppe sur plusieurs lignes dans le PDF : on compare sans tenir compte des retours à la ligne.
      expect(text.replace(/\s+/g, ' ')).toContain(checks[locale])
    }
  })

  it('does not throw on a long admin note that forces a page break', async () => {
    const longCtx: LegalContext = { ...ctx, privacyNotes: Array.from({ length: 60 }, (_, i) => `Paragraph ${i} with some extra words to force wrapping across lines.`).join('\n\n') }
    const doc = buildPrivacyPolicy(longCtx, 'en')
    const bytes = await generateLegalPdf(doc, { siteName: longCtx.siteName, version: '2026-09-28', locale: 'en' })
    expect(bytes.byteLength).toBeGreaterThan(500)
  })
})

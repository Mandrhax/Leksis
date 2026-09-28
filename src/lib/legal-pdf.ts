import 'server-only'
import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib'
import type { LegalDocument, LegalSection } from '@/lib/legal-content'
import type { UILocale } from '@/lib/i18n'

// Génère un PDF simple (texte brut, une colonne) à partir d'un LegalDocument déjà construit — voir legal-content.ts.
// Police standard Helvetica (encodage WinAnsi) : couvre les caractères accentués FR/DE/IT, mais pas les symboles
// (pas d'icône ⚠ : un préfixe textuel traduit signale les encadrés d'avertissement).

const PAGE_WIDTH  = 595.28 // A4, en points
const PAGE_HEIGHT = 841.89
const MARGIN = 56
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2

const COLOR_TEXT    = rgb(0.13, 0.15, 0.18)
const COLOR_MUTED   = rgb(0.45, 0.47, 0.51)
const COLOR_WARNING = rgb(0.62, 0.25, 0.24)

const LABELS: Record<UILocale, { warning: string; templateVersion: string; generatedOn: string }> = {
  en: { warning: 'Warning',   templateVersion: 'Template version {0}', generatedOn: 'Generated on {0}' },
  fr: { warning: 'Attention', templateVersion: 'Version du modèle {0}', generatedOn: 'Généré le {0}' },
  de: { warning: 'Achtung',   templateVersion: 'Vorlagenversion {0}', generatedOn: 'Erstellt am {0}' },
  it: { warning: 'Attenzione', templateVersion: 'Versione del modello {0}', generatedOn: 'Generato il {0}' },
}

/** Découpe un texte en lignes qui tiennent dans maxWidth, pour cette police et cette taille. */
function wrapText(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(current)
      current = word
    } else {
      current = candidate
    }
  }
  if (current) lines.push(current)
  return lines
}

class PdfWriter {
  private constructor(
    private readonly doc: PDFDocument,
    private readonly regular: PDFFont,
    private readonly bold: PDFFont,
  ) {}

  private page = undefined as unknown as Awaited<ReturnType<PDFDocument['addPage']>>
  private y = 0

  static async create(): Promise<PdfWriter> {
    const doc = await PDFDocument.create()
    const regular = await doc.embedFont(StandardFonts.Helvetica)
    const bold = await doc.embedFont(StandardFonts.HelveticaBold)
    const w = new PdfWriter(doc, regular, bold)
    w.addPage()
    return w
  }

  private addPage() {
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    this.y = PAGE_HEIGHT - MARGIN
  }

  private ensureSpace(height: number) {
    if (this.y - height < MARGIN) this.addPage()
  }

  private line(text: string, { x, size, font, color }: { x: number; size: number; font: PDFFont; color: ReturnType<typeof rgb> }) {
    const lineHeight = size * 1.35
    this.ensureSpace(lineHeight)
    this.page.drawText(text, { x, y: this.y - size, size, font, color })
    this.y -= lineHeight
  }

  /** Paragraphe justifié en pleine largeur, avec retour à la ligne automatique. */
  paragraph(text: string, opts: { size: number; bold?: boolean; color?: ReturnType<typeof rgb>; before?: number; after?: number }) {
    if (opts.before) this.y -= opts.before
    const font = opts.bold ? this.bold : this.regular
    const color = opts.color ?? COLOR_TEXT
    for (const l of wrapText(font, text, opts.size, CONTENT_WIDTH)) this.line(l, { x: MARGIN, size: opts.size, font, color })
    if (opts.after) this.y -= opts.after
  }

  /** Puce indentée. */
  bullet(text: string, size: number) {
    const indent = 14
    const lines = wrapText(this.regular, text, size, CONTENT_WIDTH - indent)
    lines.forEach((l, i) => {
      if (i === 0) {
        const lineHeight = size * 1.35
        this.ensureSpace(lineHeight)
        this.page.drawText('•', { x: MARGIN, y: this.y - size, size, font: this.regular, color: COLOR_TEXT })
        this.page.drawText(l, { x: MARGIN + indent, y: this.y - size, size, font: this.regular, color: COLOR_TEXT })
        this.y -= lineHeight
      } else {
        this.line(l, { x: MARGIN + indent, size, font: this.regular, color: COLOR_TEXT })
      }
    })
  }

  async bytes(): Promise<Uint8Array> {
    return this.doc.save()
  }
}

function renderSection(w: PdfWriter, section: LegalSection, warningLabel: string) {
  const title = section.warning ? `${warningLabel} — ${section.title}` : section.title
  w.paragraph(title, { size: 12.5, bold: true, color: section.warning ? COLOR_WARNING : COLOR_TEXT, before: 16, after: 6 })
  for (const p of section.paragraphs ?? []) w.paragraph(p, { size: 10.5, after: 6 })
  for (const item of section.items ?? []) w.bullet(item, 10.5)
}

/** Rend un LegalDocument déjà construit (voir buildPrivacyPolicy / buildUsagePolicy) en PDF. Pur, hors accès disque. */
export async function generateLegalPdf(
  doc: LegalDocument,
  opts: { siteName: string; version: string; locale: UILocale },
): Promise<Uint8Array> {
  const labels = LABELS[opts.locale]
  const w = await PdfWriter.create()

  w.paragraph(opts.siteName.toUpperCase(), { size: 9, bold: true, color: COLOR_MUTED, after: 4 })
  w.paragraph(doc.title, { size: 20, bold: true, after: 8 })
  w.paragraph(doc.intro, { size: 10, color: COLOR_MUTED, after: 4 })

  for (const section of doc.sections) renderSection(w, section, labels.warning)

  const today = new Date().toISOString().slice(0, 10)
  w.paragraph(
    `${labels.templateVersion.replace('{0}', opts.version)}  ·  ${labels.generatedOn.replace('{0}', today)}`,
    { size: 8.5, color: COLOR_MUTED, before: 18 },
  )

  return w.bytes()
}

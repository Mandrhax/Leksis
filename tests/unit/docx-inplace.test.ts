import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { Document, Footer, Header, HeadingLevel, ImageRun, Packer, Paragraph, Table, TableCell, TableRow, TextRun } from 'docx'
import { docxBlocks, docxSegments, readDocx, writeDocx } from '@/lib/docx-inplace'

// 1×1 PNG
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

async function sample(): Promise<Buffer> {
  const doc = new Document({
    sections: [{
      headers: { default: new Header({ children: [new Paragraph('Confidential header')] }) },
      footers: { default: new Footer({ children: [new Paragraph('Page footer')] }) },
      children: [
        new Paragraph({ text: 'Main title', heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ children: [new TextRun('Hello '), new TextRun({ text: 'bold', bold: true }), new TextRun(' world & co')] }),
        new Paragraph({ children: [new ImageRun({ type: 'png', data: PIXEL, transformation: { width: 10, height: 10 } })] }),
        new Table({
          rows: [
            new TableRow({ children: ['Name', 'Price'].map(t => new TableCell({ children: [new Paragraph(t)] })) }),
            new TableRow({ children: ['Strap', '120'].map(t => new TableCell({ children: [new Paragraph(t)] })) }),
          ],
        }),
      ],
    }],
  })
  return Buffer.from(await Packer.toBuffer(doc))
}

const upper = (s: string) => s.toUpperCase()

describe('readDocx / docxBlocks', () => {
  it('reads every paragraph (body, header, footer) with its whole text, runs joined', async () => {
    const doc = await readDocx(await sample())
    const texts = docxSegments(doc)
    expect(texts).toContain('Hello bold world & co')
    expect(texts).toContain('Confidential header')
    expect(texts).toContain('Page footer')
  })

  it('shows the body as headings, paragraphs and tables (header and footer are not displayed)', async () => {
    const doc = await readDocx(await sample())
    const blocks = docxBlocks(doc, docxSegments(doc))
    expect(blocks).toEqual([
      { type: 'heading', level: 1, text: 'Main title' },
      { type: 'paragraph', text: 'Hello bold world & co' },
      { type: 'table', headers: [], rows: [['Name', 'Price'], ['Strap', '120']] },
    ])
  })
})

describe('writeDocx', () => {
  it('replaces the text in the original file: formatting, images, header and footer are kept', async () => {
    const original = await sample()
    const doc = await readDocx(original)
    const out = await writeDocx(doc, docxSegments(doc).map(upper))

    const again = await readDocx(out)
    expect(docxSegments(again)).toEqual(docxSegments(await readDocx(original)).map(upper))

    const zip = await JSZip.loadAsync(out)
    const body = await zip.file('word/document.xml')!.async('string')
    expect(body).toContain('HELLO BOLD WORLD &amp; CO')      // escaped, in the first run of the paragraph
    expect(body).toContain('<w:b/>')                          // run formatting still there
    expect(Object.keys(zip.files).some(f => f.startsWith('word/media/'))).toBe(true)   // image kept
    const header = Object.keys(zip.files).find(f => /^word\/header\d*\.xml$/.test(f))!
    expect(await zip.file(header)!.async('string')).toContain('CONFIDENTIAL HEADER')
  })

  it('keeps leading and trailing spaces of a translation (xml:space="preserve")', async () => {
    const doc = await readDocx(await sample())
    const texts = docxSegments(doc).map(t => (t === 'Main title' ? ' Titre ' : t))
    const body = await (await JSZip.loadAsync(await writeDocx(doc, texts))).file('word/document.xml')!.async('string')
    expect(body).toContain('<w:t xml:space="preserve"> Titre </w:t>')
  })
})

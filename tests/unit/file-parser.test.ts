import { describe, expect, it } from 'vitest'
import {
  AlignmentType, Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun,
} from 'docx'
import type { Block } from '@/types/leksis'
import {
  applySegments, blocksToSegments, countBlockChars, isProbablyScanned,
  parseDocx, parseFile, parseHtmlTable, parseTxt, stripInlineHtml, textToBlocks,
} from '@/lib/file-parser'

describe('textToBlocks', () => {
  it('makes one paragraph per non-empty line', () => {
    expect(textToBlocks('Hello\n\n  World  \n')).toEqual([
      { type: 'paragraph', text: 'Hello' },
      { type: 'paragraph', text: 'World' },
    ])
  })
  it('reads markdown headings (## → 1, ### → 2)', () => {
    expect(textToBlocks('## Title\n### Sub\ntext')).toEqual([
      { type: 'heading', level: 1, text: 'Title' },
      { type: 'heading', level: 2, text: 'Sub' },
      { type: 'paragraph', text: 'text' },
    ])
  })
  it('reads a markdown table', () => {
    expect(textToBlocks('| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |')).toEqual([
      { type: 'table', headers: ['A', 'B'], rows: [['1', '2'], ['3', '4']] },
    ])
  })
  it('falls back to a paragraph for a malformed table', () => {
    const blocks = textToBlocks('| A | B |\n|---|---|\n| 1 |')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].type).toBe('paragraph')
  })
})

describe('blocksToSegments / applySegments', () => {
  const blocks: Block[] = [
    { type: 'heading', level: 1, text: 'Title' },
    { type: 'paragraph', text: 'Body' },
    { type: 'page-break' },
    { type: 'table', headers: ['H1', 'H2'], rows: [['a', 'b']] },
  ]

  it('lists the texts in document order, skipping page breaks', () => {
    expect(blocksToSegments(blocks)).toEqual(['Title', 'Body', 'H1', 'H2', 'a', 'b'])
  })

  it('round-trips: translated segments go back to the same structure', () => {
    expect(applySegments(blocks, ['Titre', 'Corps', 'E1', 'E2', 'x', 'y'])).toEqual([
      { type: 'heading', level: 1, text: 'Titre' },
      { type: 'paragraph', text: 'Corps' },
      { type: 'page-break' },
      { type: 'table', headers: ['E1', 'E2'], rows: [['x', 'y']] },
    ])
  })

  it('keeps the original text for any segment that is missing', () => {
    const out = applySegments(blocks, ['Titre'])
    expect(out[0]).toMatchObject({ text: 'Titre' })
    expect(out[1]).toMatchObject({ text: 'Body' })
    expect(out[3]).toEqual({ type: 'table', headers: ['H1', 'H2'], rows: [['a', 'b']] })
  })
})

describe('HTML helpers', () => {
  it('stripInlineHtml removes tags and decodes entities', () => {
    expect(stripInlineHtml('<strong>A&nbsp;&amp;&nbsp;B</strong><br/>&lt;c&gt; &quot;d&quot; &#39;e&#39;')).toBe('A & B <c> "d" \'e\'')
  })
  it('parseHtmlTable reads thead/tbody', () => {
    const html = '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td><b>2</b></td></tr></tbody></table>'
    expect(parseHtmlTable(html)).toEqual({ type: 'table', headers: ['A', 'B'], rows: [['1', '2']] })
  })
  it('parseHtmlTable handles a table without thead', () => {
    expect(parseHtmlTable('<table><tr><td>x</td></tr></table>')).toEqual({ type: 'table', headers: [], rows: [['x']] })
  })
  it('parseHtmlTable returns null for an empty table', () => {
    expect(parseHtmlTable('<table></table>')).toBeNull()
  })
})

describe('parseDocx', () => {
  async function docxBuffer(): Promise<Buffer> {
    const doc = new Document({
      numbering: {
        config: [{
          reference: 'nums',
          levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: AlignmentType.START }],
        }],
      },
      sections: [{
        children: [
          new Paragraph({ text: 'Main title', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: 'Section', heading: HeadingLevel.HEADING_3 }),
          new Paragraph({ children: [new TextRun('Intro paragraph')] }),
          new Paragraph({ text: 'first bullet', bullet: { level: 0 } }),
          new Paragraph({ text: 'second bullet', bullet: { level: 0 } }),
          new Paragraph({ text: 'step one', numbering: { reference: 'nums', level: 0 } }),
          new Paragraph({ text: 'step two', numbering: { reference: 'nums', level: 0 } }),
          new Table({
            rows: [
              new TableRow({ children: ['A', 'B'].map(t => new TableCell({ children: [new Paragraph(t)] })) }),
              new TableRow({ children: ['1', '2'].map(t => new TableCell({ children: [new Paragraph(t)] })) }),
            ],
          }),
        ],
      }],
    })
    return Buffer.from(await Packer.toBuffer(doc))
  }

  it('keeps headings (h3 folded into level 2), lists and tables', async () => {
    const blocks = await parseDocx(await docxBuffer())
    const texts = blocks.filter(b => b.type === 'paragraph' || b.type === 'heading').map(b => (b as { text: string }).text)

    expect(blocks[0]).toEqual({ type: 'heading', level: 1, text: 'Main title' })
    expect(blocks[1]).toEqual({ type: 'heading', level: 2, text: 'Section' })
    expect(texts).toContain('Intro paragraph')
    expect(texts).toContain('• first bullet')
    expect(texts).toContain('• second bullet')
    expect(texts).toContain('1. step one')
    expect(texts).toContain('2. step two')
    expect(blocks.some(b => b.type === 'table')).toBe(true)
  })

  it('is what parseFile dispatches to for .docx', async () => {
    const buf = await docxBuffer()
    expect(await parseFile(buf, 'Report.DOCX')).toEqual(await parseDocx(buf))
  })
})

describe('parseTxt / parseFile', () => {
  it('reads UTF-8 text', () => {
    expect(parseTxt(Buffer.from('Grüezi\nÇa va'))).toEqual([
      { type: 'paragraph', text: 'Grüezi' },
      { type: 'paragraph', text: 'Ça va' },
    ])
  })
  it('handles txt and csv, rejects everything else (.doc included)', async () => {
    expect(await parseFile(Buffer.from('a,b'), 'x.csv')).toHaveLength(1)
    expect(await parseFile(Buffer.from('a'), 'x.txt')).toHaveLength(1)
    await expect(parseFile(Buffer.from('a'), 'x.doc')).rejects.toThrow('Unsupported file type: .doc')
  })
})

describe('isProbablyScanned / countBlockChars', () => {
  it('flags a document with almost no text', () => {
    expect(isProbablyScanned([{ type: 'paragraph', text: 'page 1' }])).toBe(true)
    expect(isProbablyScanned([{ type: 'paragraph', text: 'x'.repeat(100) }])).toBe(false)
  })
  it('counts table cells too, whitespace ignored when detecting scans', () => {
    const table: Block = { type: 'table', headers: ['a '.repeat(60)], rows: [['b '.repeat(60)]] }
    expect(isProbablyScanned([table])).toBe(false)
    expect(countBlockChars([{ type: 'paragraph', text: 'abc' }, { type: 'heading', level: 1, text: 'de' }, { type: 'page-break' }, { type: 'table', headers: ['f'], rows: [['gh']] }])).toBe(8)
  })
})

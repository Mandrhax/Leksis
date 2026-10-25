// Export du résultat d'un document traduit en DOCX (blocs → fichier Word). Server-only (package `docx`).

import 'server-only'
import {
  Document, Paragraph, Run, HeadingLevel, Packer, PageBreak,
  Table, TableRow, TableCell, WidthType, BorderStyle,
} from 'docx'
import type { Block } from '@/types/leksis'

const borderDef = {
  top:    { style: BorderStyle.SINGLE, size: 4, color: '999999' },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: '999999' },
  left:   { style: BorderStyle.SINGLE, size: 4, color: '999999' },
  right:  { style: BorderStyle.SINGLE, size: 4, color: '999999' },
}

function makeCell(text: string, isHeader: boolean): TableCell {
  return new TableCell({
    borders: borderDef,
    shading: isHeader ? { fill: 'EEF1F6' } : undefined,
    children: [new Paragraph({ children: [new Run({ text, bold: isHeader })] })],
  })
}

function makeTable(block: Extract<Block, { type: 'table' }>): Table {
  const rows: TableRow[] = []
  // Pas de ligne d'en-tête vide : un tableau Word sans ligne d'en-tête marquée (le cas courant) arrive avec
  // `headers: []`, et une ligne sans cellule rend le fichier illisible pour Word
  if (block.headers.length) {
    rows.push(new TableRow({ tableHeader: true, children: block.headers.map(h => makeCell(h, true)) }))
  }
  for (const row of block.rows) {
    if (row.length) rows.push(new TableRow({ children: row.map(c => makeCell(c, false)) }))
  }
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows })
}

/** Fichier DOCX (simple : styles par défaut) reconstruit à partir des blocs. */
export async function blocksToDocx(blocks: Block[]): Promise<Buffer> {
  const children = blocks
    .filter(b => b.type === 'page-break'
      || (b.type === 'table' && (b.headers.length > 0 || b.rows.some(r => r.length > 0)))
      || ((b.type === 'paragraph' || b.type === 'heading') && b.text.trim()))
    .map(block => {
      if (block.type === 'page-break') return new Paragraph({ children: [new PageBreak()] })
      if (block.type === 'heading') {
        return new Paragraph({ text: block.text, heading: block.level === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2 })
      }
      if (block.type === 'table') return makeTable(block)
      return new Paragraph({ text: block.text })
    })

  return Packer.toBuffer(new Document({ sections: [{ children }] }))
}

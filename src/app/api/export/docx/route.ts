import { NextRequest, NextResponse } from 'next/server'
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

export async function POST(req: NextRequest) {
  let body: { blocks?: Block[]; filename?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  const { blocks, filename } = body
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return NextResponse.json({ error: 'blocks must be a non-empty array.' }, { status: 400 })
  }
  if (!filename || typeof filename !== 'string') {
    return NextResponse.json({ error: 'filename is required.' }, { status: 400 })
  }

  const children = blocks
    .filter(b => b.type === 'page-break' || b.type === 'table' ||
      ((b.type === 'paragraph' || b.type === 'heading') && b.text.trim()))
    .map(block => {
      if (block.type === 'page-break') {
        return new Paragraph({ children: [new PageBreak()] })
      }
      if (block.type === 'heading') {
        return new Paragraph({
          text: block.text,
          heading: block.level === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
        })
      }
      if (block.type === 'table') {
        const headerRow = new TableRow({
          tableHeader: true,
          children: block.headers.map(h => makeCell(h, true)),
        })
        const dataRows = block.rows.map(row =>
          new TableRow({ children: row.map(c => makeCell(c, false)) })
        )
        return new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [headerRow, ...dataRows],
        })
      }
      // paragraph
      return new Paragraph({ text: (block as { type: 'paragraph'; text: string }).text })
    })

  const doc = new Document({ sections: [{ children }] })
  const buffer = await Packer.toBuffer(doc)

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

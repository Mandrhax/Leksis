import { NextRequest, NextResponse } from 'next/server'
import {
  Document, Paragraph, Run, HeadingLevel, Packer, PageBreak,
  Table, TableRow, TableCell, WidthType, BorderStyle,
} from 'docx'
import { z } from 'zod'
import { requireUser } from '@/lib/user-guard'
import { requestTooLarge } from '@/lib/validators'

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

const MAX_BODY_BYTES = 5 * 1024 * 1024
const MAX_BLOCKS     = 20_000

const BlockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('paragraph'), text: z.string() }),
  z.object({ type: z.literal('heading'), level: z.union([z.literal(1), z.literal(2)]), text: z.string() }),
  z.object({ type: z.literal('table'), headers: z.array(z.string()), rows: z.array(z.array(z.string())) }),
  z.object({ type: z.literal('page-break') }),
  z.object({ type: z.literal('html'), content: z.string() }),
])

const BodySchema = z.object({
  blocks:   z.array(BlockSchema).min(1).max(MAX_BLOCKS),
  filename: z.string().min(1).max(200),
})

/** Nom de fichier sûr pour Content-Disposition : pas de séparateurs, guillemets ni caractères de contrôle. */
function safeFilename(name: string): string {
  const cleaned = name.replace(/[\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120)
  const base = cleaned && cleaned !== '.docx' ? cleaned : 'document'
  return /\.docx$/i.test(base) ? base : `${base}.docx`
}

/** Content-Disposition avec repli ASCII + nom UTF-8 (RFC 5987) pour les accents. */
function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_')
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

export async function POST(req: NextRequest) {
  const guard = await requireUser()
  if (guard.error) return guard.error

  if (requestTooLarge(req, MAX_BODY_BYTES)) {
    return NextResponse.json({ error: 'Request too large.' }, { status: 413 })
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  const parsed = BodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'blocks must be a non-empty array and filename is required.' }, { status: 400 })
  }
  const { blocks } = parsed.data
  const filename = safeFilename(parsed.data.filename)

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
      'Content-Disposition': contentDisposition(filename),
    },
  })
}

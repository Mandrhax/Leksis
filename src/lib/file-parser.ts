// Server-only — extraction texte côté serveur
// Port de la logique de Leksis_old/assets/js/doc-studio.js

import type { Block } from '@/types/leksis'

export const BLOCK_SEP = '|||'

// ── Parsing markdown tables (port de doc-studio.js) ────────────

function parseMarkdownTable(lines: string[]): Extract<Block, { type: 'table' }> | null {
  if (lines.length < 2) return null
  const isTableRow = (l: string) => l.trim().startsWith('|') && l.trim().endsWith('|')
  if (!lines.every(isTableRow)) return null
  const isSepRow = (l: string) => /^\|[\s|:-]+\|$/.test(l.trim())
  const sepIdx = lines.findIndex(isSepRow)
  if (sepIdx < 0) return null

  const parseRow = (l: string) =>
    l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim())

  const headers = parseRow(lines[0])
  const rows    = lines.filter((_, i) => i !== 0 && i !== sepIdx).map(parseRow)
  const colCount = headers.length
  if (colCount === 0 || rows.some(r => r.length !== colCount)) return null

  return { type: 'table', headers, rows }
}

export function textToBlocks(text: string): Block[] {
  const blocks: Block[] = []
  const rawLines = text.split('\n')
  let i = 0

  while (i < rawLines.length) {
    // Table rows (markdown syntax from Ollama OCR)
    if (rawLines[i].trim().startsWith('|')) {
      const tableLines: string[] = []
      while (i < rawLines.length && rawLines[i].trim().startsWith('|')) {
        tableLines.push(rawLines[i++])
      }
      const tableBlock = parseMarkdownTable(tableLines)
      if (tableBlock) { blocks.push(tableBlock); continue }
      const txt = tableLines.join(' ').replace(/\|/g, ' ').replace(/\s+/g, ' ').trim()
      if (txt) blocks.push({ type: 'paragraph', text: txt })
      continue
    }

    // Skip empty lines
    if (!rawLines[i].trim()) { i++; continue }

    // Markdown headings (from OCR output)
    if (rawLines[i].trimStart().startsWith('### ')) {
      const t = rawLines[i].trim().replace(/^###\s+/, '')
      if (t) blocks.push({ type: 'heading', level: 2, text: t })
      i++; continue
    }
    if (rawLines[i].trimStart().startsWith('## ')) {
      const t = rawLines[i].trim().replace(/^##\s+/, '')
      if (t) blocks.push({ type: 'heading', level: 1, text: t })
      i++; continue
    }

    // Each non-empty line becomes its own paragraph block.
    // This is the most reliable approach across all sources:
    // pdf-parse v2 (one text element per line), OCR output, TXT files.
    blocks.push({ type: 'paragraph', text: rawLines[i].trim() })
    i++
  }

  return blocks
}

// ── Flatten / unflatten pour traduction ────────────────────────

export function flattenBlocks(blocks: Block[]): string {
  const segments: string[] = []
  for (const block of blocks) {
    if (block.type === 'page-break') continue
    if (block.type === 'paragraph' || block.type === 'heading') {
      segments.push(block.text)
    } else if (block.type === 'table') {
      segments.push(...block.headers)
      for (const row of block.rows) segments.push(...row)
    } else if (block.type === 'html') {
      // Strip HTML tags to expose plain text for translation
      const text = block.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      if (text) segments.push(text)
    }
  }
  return segments.join(` ${BLOCK_SEP} `)
}

export function applyTranslatedSegments(blocks: Block[], translated: string): Block[] {
  const parts = translated.split(/\s*\|\|\|\s*/)
  let idx = 0

  return blocks.map(block => {
    if (block.type === 'page-break') return block
    if (block.type === 'paragraph' || block.type === 'heading') {
      return { ...block, text: parts[idx++] ?? block.text }
    }
    if (block.type === 'table') {
      const newHeaders = block.headers.map(() => parts[idx++] ?? '')
      const newRows    = block.rows.map(row => row.map(() => parts[idx++] ?? ''))
      return { ...block, headers: newHeaders, rows: newRows }
    }
    if (block.type === 'html') {
      // Convert html block to paragraph with translated plain text
      return { type: 'paragraph' as const, text: parts[idx++] ?? '' }
    }
    return block
  })
}

// ── PDF ────────────────────────────────────────────────────────

export async function parsePdf(buffer: Buffer): Promise<Block[]> {
  // pdf-parse v2 class-based API.
  // lineThreshold: 1 — detect line breaks for any line spacing (default 4.6 misses tight PDFs).
  // itemJoiner: ' ' — separate text items within a line with a space instead of empty string.
  const { PDFParse } = await import('pdf-parse') as {
    PDFParse: new (opts: { data: Buffer }) => {
      getText(params?: { lineThreshold?: number; itemJoiner?: string }): Promise<{ text: string }>
    }
  }
  const parser = new PDFParse({ data: buffer })
  const result = await parser.getText({ lineThreshold: 1, itemJoiner: ' ' })
  return textToBlocks(result.text)
}

// ── DOCX ───────────────────────────────────────────────────────

function stripInlineTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .trim()
}

function htmlToBlocks(html: string): Block[] {
  const blocks: Block[] = []

  // Extract tables first, replacing them with placeholders to avoid conflicts
  const tables: Block[] = []
  const noTables = html.replace(/<table[\s\S]*?<\/table>/gi, match => {
    const headers: string[] = []
    const rows: string[][] = []

    const theadMatch = match.match(/<thead[\s\S]*?<\/thead>/i)
    const tbodyMatch = match.match(/<tbody[\s\S]*?<\/tbody>/i)

    if (theadMatch) {
      const thMatches = [...theadMatch[0].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)]
      thMatches.forEach(m => headers.push(stripInlineTags(m[1])))
    }

    const rowSource = tbodyMatch ? tbodyMatch[0] : match
    const trMatches = [...rowSource.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
    trMatches.forEach(tr => {
      const cells = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
      if (cells.length) rows.push(cells.map(c => stripInlineTags(c[1])))
    })

    if (headers.length || rows.length) {
      tables.push({ type: 'table', headers, rows })
      return `__TABLE_${tables.length - 1}__`
    }
    return ''
  })

  // Walk remaining HTML line by line for headings and paragraphs
  const tokens = noTables.split(/(?=<h[12]|<p[ >]|__TABLE_)/i)
  for (const token of tokens) {
    const tableMatch = token.match(/^__TABLE_(\d+)__/)
    if (tableMatch) {
      blocks.push(tables[parseInt(tableMatch[1])])
      continue
    }
    const h1 = token.match(/^<h1[^>]*>([\s\S]*?)<\/h1>/i)
    if (h1) { const t = stripInlineTags(h1[1]); if (t) blocks.push({ type: 'heading', level: 1, text: t }); continue }
    const h2 = token.match(/^<h2[^>]*>([\s\S]*?)<\/h2>/i)
    if (h2) { const t = stripInlineTags(h2[1]); if (t) blocks.push({ type: 'heading', level: 2, text: t }); continue }
    const p = token.match(/^<p[^>]*>([\s\S]*?)<\/p>/i)
    if (p) { const t = stripInlineTags(p[1]); if (t) blocks.push({ type: 'paragraph', text: t }); continue }
  }

  return blocks
}

export async function parseDocx(buffer: Buffer): Promise<Block[]> {
  const mammoth = await import('mammoth')
  const result = await mammoth.convertToHtml({ buffer })
  return htmlToBlocks(result.value)
}

// ── TXT / CSV ──────────────────────────────────────────────────

export function parseTxt(buffer: Buffer): Block[] {
  const text = buffer.toString('utf-8')
  return textToBlocks(text)
}

// ── Dispatch selon extension ───────────────────────────────────

export async function parseFile(buffer: Buffer, filename: string): Promise<Block[]> {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'pdf')              return parsePdf(buffer)
  if (ext === 'docx' || ext === 'doc') return parseDocx(buffer)
  if (ext === 'txt' || ext === 'csv')  return parseTxt(buffer)
  throw new Error(`Unsupported file type: .${ext}`)
}

// ── Détecter les PDFs scannés (peu ou pas de texte extrait) ────

export function isProbablyScanned(blocks: Block[]): boolean {
  const n = blocks.reduce((total, block) => {
    if (block.type === 'paragraph' || block.type === 'heading')
      return total + block.text.replace(/\s/g, '').length
    if (block.type === 'table')
      return total + [...block.headers, ...block.rows.flat()].join('').replace(/\s/g, '').length
    return total
  }, 0)
  return n < 100
}

// ── Compter les caractères dans les blocks ─────────────────────

export function countBlockChars(blocks: Block[]): number {
  return blocks.reduce((total, block) => {
    if (block.type === 'paragraph' || block.type === 'heading') return total + block.text.length
    if (block.type === 'table') {
      return total + [...block.headers, ...block.rows.flat()].join('').length
    }
    if (block.type === 'html') {
      return total + block.content.replace(/<[^>]+>/g, '').length
    }
    return total
  }, 0)
}

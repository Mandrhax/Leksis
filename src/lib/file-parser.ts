// Extraction texte côté serveur (PDF, DOCX, TXT/CSV) et conversion vers le modèle de blocs

import 'server-only'
import type { Block } from '@/types/leksis'

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

// ── Segments pour la traduction ────────────────────────────────

/** Textes à traduire, dans l'ordre du document : paragraphes, titres, puis en-têtes et cellules des tableaux. */
export function blocksToSegments(blocks: Block[]): string[] {
  const segments: string[] = []
  for (const block of blocks) {
    if (block.type === 'paragraph' || block.type === 'heading') {
      segments.push(block.text)
    } else if (block.type === 'table') {
      segments.push(...block.headers)
      for (const row of block.rows) segments.push(...row)
    }
  }
  return segments
}

/** Remet les segments traduits (même ordre et même nombre que `blocksToSegments`) dans la structure du document. */
export function applySegments(blocks: Block[], segments: string[]): Block[] {
  let idx = 0
  const next = (fallback: string) => segments[idx++] ?? fallback

  return blocks.map(block => {
    if (block.type === 'paragraph' || block.type === 'heading') {
      return { ...block, text: next(block.text) }
    }
    if (block.type === 'table') {
      return {
        ...block,
        headers: block.headers.map(h => next(h)),
        rows:    block.rows.map(row => row.map(c => next(c))),
      }
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

/** Texte brut d'un fragment HTML : <br> → espace, balises retirées, entités courantes décodées. */
export function stripInlineHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .trim()
}

/** Bloc tableau d'un <table> HTML (mammoth pour les DOCX, sortie du modèle OCR pour les PDF scannés), ou null s'il est vide. */
export function parseHtmlTable(html: string): Extract<Block, { type: 'table' }> | null {
  const headers: string[] = []
  const rows: string[][] = []

  const theadMatch = html.match(/<thead[\s\S]*?<\/thead>/i)
  const tbodyMatch = html.match(/<tbody[\s\S]*?<\/tbody>/i)

  if (theadMatch) {
    for (const m of theadMatch[0].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)) headers.push(stripInlineHtml(m[1]))
  }

  const rowSource = tbodyMatch ? tbodyMatch[0] : html
  for (const tr of rowSource.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
    if (cells.length) rows.push(cells.map(c => stripInlineHtml(c[1])))
  }

  if (!headers.length && !rows.length) return null
  return { type: 'table', headers, rows }
}

function htmlToBlocks(html: string): Block[] {
  const blocks: Block[] = []

  // Extract tables first, replacing them with placeholders to avoid conflicts
  const tables: Block[] = []
  const noTables = html.replace(/<table[\s\S]*?<\/table>/gi, match => {
    const table = parseHtmlTable(match)
    if (!table) return ''
    tables.push(table)
    return `__TABLE_${tables.length - 1}__`
  })

  // One token per block-level element. Lists are split at every <ul>/<ol>/<li>, so each
  // list item (nested ones included) becomes its own paragraph instead of being dropped.
  const tokens = noTables.split(/(?=<h[1-6][ >]|<p[ >]|<li[ >]|<ul[ >]|<ol[ >]|__TABLE_)/i)
  let ordered = false
  let counter = 0

  for (const token of tokens) {
    const tableMatch = token.match(/^__TABLE_(\d+)__/)
    if (tableMatch) {
      blocks.push(tables[parseInt(tableMatch[1])])
      continue
    }

    const list = token.match(/^<(ul|ol)[ >]/i)
    if (list) {
      ordered = list[1].toLowerCase() === 'ol'
      counter = 0
      continue
    }

    // Heading levels 3–6 are folded into level 2 (the Block model only has two levels)
    const heading = token.match(/^<h([1-6])[^>]*>([\s\S]*?)(?:<\/h[1-6]>|$)/i)
    if (heading) {
      const t = stripInlineHtml(heading[2])
      if (t) blocks.push({ type: 'heading', level: heading[1] === '1' ? 1 : 2, text: t })
      continue
    }

    const item = token.match(/^<li[^>]*>([\s\S]*)$/i)
    if (item) {
      const t = stripInlineHtml(item[1])
      if (t) blocks.push({ type: 'paragraph', text: `${ordered ? `${++counter}.` : '•'} ${t}` })
      continue
    }

    const p = token.match(/^<p[^>]*>([\s\S]*?)(?:<\/p>|$)/i)
    if (p) {
      const t = stripInlineHtml(p[1])
      if (t) blocks.push({ type: 'paragraph', text: t })
    }
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
  if (ext === 'docx')             return parseDocx(buffer)
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
    return total
  }, 0)
}

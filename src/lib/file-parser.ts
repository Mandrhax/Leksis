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
  return textToBlocks(mergeWrappedLines(result.text))
}

const LIST_OR_TABLE_START = /^\s*([-•*–|#]|\d+[.)]\s)/

/**
 * Recolle les lignes d'un PDF en paragraphes. L'extraction rend une ligne par ligne VISUELLE : une phrase coupée en
 * fin de ligne devenait deux segments traduits séparément (mauvaise traduction, plus de relances `|||`).
 * Une ligne qui atteint presque la marge droite (≥ 75 % de la largeur courante du texte) continue sur la suivante ;
 * une ligne plus courte termine son paragraphe (fin de paragraphe, titre). Mot coupé par un trait d'union : recollé.
 * Les lignes vides, de liste ou de tableau ne sont jamais fusionnées.
 */
export function mergeWrappedLines(text: string): string {
  const lines = text.split('\n')
  const lengths = lines.map(l => l.trim().length).filter(n => n > 0).sort((a, b) => a - b)
  if (lengths.length < 3) return text
  // Largeur « pleine » du texte : 90ᵉ centile des longueurs de ligne (insensible à quelques lignes très longues)
  const fullWidth = lengths[Math.floor((lengths.length - 1) * 0.9)]
  const wraps = (line: string) => line.length >= fullWidth * 0.75

  const out: string[] = []
  let current = ''   // paragraphe en cours
  let last = ''      // dernière ligne physique ajoutée : c'est elle qui dit si le texte continue
  for (const raw of lines) {
    const line = raw.trim()
    const startsBlock = !line || LIST_OR_TABLE_START.test(line)
    if (current && !startsBlock && wraps(last) && !current.startsWith('|')) {
      current = /\p{L}-$/u.test(current) && /^\p{Ll}/u.test(line)
        ? current.slice(0, -1) + line
        : `${current} ${line}`
      last = line
      continue
    }
    if (current) out.push(current)
    if (!line) { out.push(''); current = ''; last = ''; continue }
    current = line
    last = line
  }
  if (current) out.push(current)
  return out.join('\n')
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

/** Taille décompressée maximale d'un DOCX (toutes ses parties) : au-delà, c'est une bombe ZIP ou un fichier hors d'usage. */
export const DOCX_MAX_UNCOMPRESSED_BYTES = 150 * 1024 * 1024

/**
 * Somme des tailles décompressées annoncées par le répertoire central d'un ZIP (DOCX), sans rien décompresser ;
 * null si le fichier n'est pas un ZIP lisible. ZIP64 (taille 0xFFFFFFFF) compté comme démesuré.
 */
export function zipUncompressedSize(buf: Buffer): number | null {
  // Fin du répertoire central : signature PK\x05\x06, dans les 65 557 derniers octets (commentaire ≤ 64 Ko)
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) return null
  const entries = buf.readUInt16LE(eocd + 10)
  let offset = buf.readUInt32LE(eocd + 16)
  let total = 0
  for (let n = 0; n < entries; n++) {
    if (offset + 46 > buf.length || buf.readUInt32LE(offset) !== 0x02014b50) return null
    const size = buf.readUInt32LE(offset + 24)
    if (size === 0xffffffff) return Number.POSITIVE_INFINITY
    total += size
    offset += 46 + buf.readUInt16LE(offset + 28) + buf.readUInt16LE(offset + 30) + buf.readUInt16LE(offset + 32)
  }
  return total
}

export async function parseDocx(buffer: Buffer): Promise<Block[]> {
  // jszip (sous mammoth) décompresse en mémoire sans limite : on vérifie d'abord la taille annoncée
  const size = zipUncompressedSize(buffer)
  if (size === null) throw new Error('Not a valid DOCX (ZIP) file')
  if (size > DOCX_MAX_UNCOMPRESSED_BYTES) throw new Error(`DOCX too large once uncompressed (${size} bytes)`)

  const mammoth = await import('mammoth')
  // Images ignorées : par défaut mammoth les met en base64 dans le HTML (un DOCX de photos de 10 Mo devenait une
  // chaîne de 13 Mo parcourue par les regex), alors que seul le texte est traduit
  const result = await mammoth.convertToHtml({ buffer }, { convertImage: mammoth.images.imgElement(async () => ({ src: '' })) })
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

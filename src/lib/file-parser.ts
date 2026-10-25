// Extraction texte côté serveur (PDF, DOCX, TXT/CSV) et conversion vers le modèle de blocs

import 'server-only'
import type { Block } from '@/types/leksis'
import { detectDelimiter, parseCsvRecords } from '@/lib/glossary-csv'
import { readDocx, docxBlocks, docxSegments, type DocxContent } from '@/lib/docx-inplace'

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
    // PDF text extraction (one line per visual line, see parsePdf), OCR output, TXT files.
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

/** Morceau de texte d'une page tel que pdfjs le rend (seuls les champs utilisés). */
export type PdfTextItem = { str: string; transform: number[]; hasEOL?: boolean }

/**
 * Lignes d'une page à partir des morceaux de texte de pdfjs : un changement de hauteur (transform[5]) ou une fin de
 * ligne signalée (hasEOL) ouvre une nouvelle ligne ; les morceaux d'une même ligne sont séparés par une espace.
 */
export function pdfItemsToLines(items: PdfTextItem[]): string[] {
  const lines: string[] = []
  let line = ''
  let lastY: number | null = null
  const flush = () => {
    const clean = line.replace(/\s+/g, ' ').trim()
    if (clean) lines.push(clean)
    line = ''
  }
  for (const item of items) {
    const y = item.transform[5]
    if (lastY !== null && Math.abs(y - lastY) > 1) flush()
    line += (line ? ' ' : '') + item.str
    lastY = y
    if (item.hasEOL) { flush(); lastY = null }
  }
  flush()
  return lines
}

export async function parsePdf(buffer: Buffer): Promise<Block[]> {
  // pdfjs-dist directement (déjà chargé pour l'OCR des PDF scannés) : pdf-parse en embarquait une 2ᵉ copie
  // (pdfjs + canvas, ~70 Mo) et ne libérait pas sa mémoire
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs' as string) as typeof import('pdfjs-dist')
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) })
  try {
    const pdf = await loadingTask.promise
    const pages: string[] = []
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      pages.push(pdfItemsToLines(content.items.filter((it): it is typeof it & PdfTextItem => 'str' in it)).join('\n'))
      page.cleanup()
    }
    return textToBlocks(mergeWrappedLines(pages.join('\n\n')))
  } finally {
    await loadingTask.destroy().catch(() => {})
  }
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
  // Lignes courtes partout (titres, tableau, document de quelques lignes) : pas de texte coupé à la marge
  if (fullWidth < 40) return text
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

/** Bloc tableau d'un <table> HTML (sortie du modèle OCR pour les PDF scannés), ou null s'il est vide. */
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

/**
 * DOCX lu directement dans son XML (lib/docx-inplace.ts) : blocs affichés + document gardé pour y réécrire la
 * traduction (mise en page conservée). La taille décompressée est vérifiée d'abord : jszip décompresse en mémoire
 * sans limite.
 */
export async function parseDocxDocument(buffer: Buffer): Promise<{ doc: DocxContent; blocks: Block[] }> {
  const size = zipUncompressedSize(buffer)
  if (size === null) throw new Error('Not a valid DOCX (ZIP) file')
  if (size > DOCX_MAX_UNCOMPRESSED_BYTES) throw new Error(`DOCX too large once uncompressed (${size} bytes)`)
  const doc = await readDocx(buffer)
  return { doc, blocks: docxBlocks(doc, docxSegments(doc)) }
}

export async function parseDocx(buffer: Buffer): Promise<Block[]> {
  return (await parseDocxDocument(buffer)).blocks
}

// ── TXT / CSV ──────────────────────────────────────────────────

export function parseTxt(buffer: Buffer): Block[] {
  const text = buffer.toString('utf-8')
  return textToBlocks(text)
}

/**
 * CSV → un tableau (1re ligne = en-têtes), cellule par cellule : chaque cellule est un segment traduit à part,
 * le modèle ne voit jamais les séparateurs (avant : une ligne = un paragraphe, qu'il pouvait réécrire librement).
 * Séparateur détecté (virgule, point-virgule, tabulation), guillemets RFC 4180, BOM toléré ; lignes complétées
 * à la largeur de la plus longue.
 */
export function parseCsv(buffer: Buffer): Block[] {
  const text = buffer.toString('utf-8').replace(/^﻿/, '')
  const records = parseCsvRecords(text, detectDelimiter(text))
  if (!records.length) return []
  const width = Math.max(...records.map(r => r.cells.length))
  const pad = (cells: string[]) => [...cells, ...Array<string>(width - cells.length).fill('')].map(c => c.trim())
  const [head, ...rest] = records
  return [{ type: 'table', headers: pad(head.cells), rows: rest.map(r => pad(r.cells)) }]
}

// ── Dispatch selon extension ───────────────────────────────────

export async function parseFile(buffer: Buffer, filename: string): Promise<Block[]> {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'pdf')              return parsePdf(buffer)
  if (ext === 'docx')             return parseDocx(buffer)
  if (ext === 'txt')              return parseTxt(buffer)
  if (ext === 'csv')              return parseCsv(buffer)
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

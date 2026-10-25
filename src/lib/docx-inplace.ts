// DOCX lu et traduit DANS le fichier d'origine : on remplace le texte des paragraphes du XML Word sans toucher au
// reste (styles, polices, couleurs, images, tableaux, en-têtes et pieds de page, numérotation, mise en page).
// Avant, le résultat était un nouveau DOCX reconstruit à partir de blocs (gras, couleurs, images… perdus).
//
// Un paragraphe (<w:p>) = un segment traduit. Sa traduction va dans le premier <w:t> du paragraphe, les autres
// <w:t> sont vidés : la mise en forme du début du paragraphe s'applique à toute la phrase (un mot en gras au
// milieu perd son gras — l'ordre des mots change de toute façon d'une langue à l'autre).

import 'server-only'
import JSZip from 'jszip'
import type { Block } from '@/types/leksis'

/** Parties du DOCX dont le texte est traduit : corps, en-têtes, pieds de page, notes. */
const TEXT_PARTS = /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/

interface TextRun { openStart: number; openEnd: number; closeStart: number; text: string }
interface Paragraph {
  part: string
  runs: TextRun[]
  /** Style du paragraphe (titres) */
  style: string | null
  /** Élément de liste : numérotation et niveau */
  num: { id: string; level: number } | null
  /** Position dans un tableau du corps : [tableau, ligne, cellule], null hors tableau */
  cell: [number, number, number] | null
  text: string
}

export interface DocxContent {
  /** Paragraphes de toutes les parties, dans l'ordre du fichier */
  paragraphs: Paragraph[]
  xml: Map<string, string>
  zip: JSZip
  numbering: Map<string, string[]>
}

const decodeXml = (s: string) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&amp;/g, '&')

const encodeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Balises utiles, dans l'ordre du document. `<w:p>` / `<w:p ...>` mais pas `<w:pPr>` ; `<w:t>` mais pas `<w:tab/>`.
const TOKEN = /<w:p(?=[\s>/])[^>]*?(\/?)>|<\/w:p>|<w:t(?=[\s>/])[^>]*?(\/?)>|<\/w:t>|<w:tbl[\s>]|<\/w:tbl>|<w:tr(?=[\s>])[^>]*>|<\/w:tr>|<w:tc(?=[\s>])[^>]*>|<\/w:tc>|<w:pStyle\s[^>]*w:val="([^"]*)"|<w:numId\s[^>]*w:val="([^"]*)"|<w:ilvl\s[^>]*w:val="(\d+)"/g

function scanPart(part: string, xml: string, out: Paragraph[]) {
  const stack: Paragraph[] = []
  const tables: { index: number; row: number; cell: number }[] = []
  let tableCount = 0
  let openT: { start: number; end: number } | null = null
  const finish = (p: Paragraph) => {
    p.text = p.runs.map(r => r.text).join('')
    out.push(p)
  }

  for (const m of xml.matchAll(TOKEN)) {
    const tok = m[0]
    const at = m.index!
    const top = stack[stack.length - 1]
    if (tok.startsWith('<w:p') && !tok.startsWith('<w:pStyle')) {
      const t = tables[tables.length - 1]
      const p: Paragraph = { part, runs: [], style: null, num: null, cell: t ? [t.index, t.row, t.cell] : null, text: '' }
      if (m[1] === '/') finish(p)   // <w:p/> : paragraphe vide
      else stack.push(p)
    } else if (tok === '</w:p>') {
      const p = stack.pop()
      if (p) finish(p)
    } else if (tok.startsWith('<w:t') && !tok.startsWith('<w:tbl') && !tok.startsWith('<w:tr') && !tok.startsWith('<w:tc')) {
      if (m[2] === '/') continue   // <w:t/> : vide
      openT = { start: at, end: at + tok.length }
    } else if (tok === '</w:t>') {
      if (openT && top) top.runs.push({ openStart: openT.start, openEnd: openT.end, closeStart: at, text: decodeXml(xml.slice(openT.end, at)) })
      openT = null
    } else if (tok.startsWith('<w:tbl')) {
      tables.push({ index: tableCount++, row: -1, cell: -1 })
    } else if (tok === '</w:tbl>') {
      tables.pop()
    } else if (tok.startsWith('<w:tr')) {
      const t = tables[tables.length - 1]
      if (t) { t.row++; t.cell = -1 }
    } else if (tok.startsWith('<w:tc')) {
      const t = tables[tables.length - 1]
      if (t) t.cell++
    } else if (m[3] !== undefined && top) {
      top.style = m[3]
    } else if (m[4] !== undefined && top) {
      top.num = { id: m[4], level: top.num?.level ?? 0 }
    } else if (m[5] !== undefined && top) {
      top.num = { id: top.num?.id ?? '', level: Number(m[5]) }
    }
  }
}

/** Format de chaque niveau de chaque liste (numId → numFmt par niveau), lu dans numbering.xml. */
function readNumbering(xml: string | undefined): Map<string, string[]> {
  const result = new Map<string, string[]>()
  if (!xml) return result
  const abstract = new Map<string, string[]>()
  for (const a of xml.matchAll(/<w:abstractNum\s[^>]*w:abstractNumId="(\d+)"[^>]*>([\s\S]*?)<\/w:abstractNum>/g)) {
    const levels: string[] = []
    for (const l of a[2].matchAll(/<w:lvl\s[^>]*w:ilvl="(\d+)"[^>]*>([\s\S]*?)<\/w:lvl>/g)) {
      levels[Number(l[1])] = /<w:numFmt\s[^>]*w:val="([^"]+)"/.exec(l[2])?.[1] ?? 'bullet'
    }
    abstract.set(a[1], levels)
  }
  for (const n of xml.matchAll(/<w:num\s[^>]*w:numId="(\d+)"[^>]*>([\s\S]*?)<\/w:num>/g)) {
    const abs = /<w:abstractNumId\s[^>]*w:val="(\d+)"/.exec(n[2])?.[1]
    if (abs && abstract.has(abs)) result.set(n[1], abstract.get(abs)!)
  }
  return result
}

export async function readDocx(buffer: Buffer): Promise<DocxContent> {
  const zip = await JSZip.loadAsync(buffer)
  const parts = Object.keys(zip.files).filter(name => TEXT_PARTS.test(name))
    // Corps d'abord (c'est lui qu'on affiche), puis en-têtes, pieds de page et notes
    .sort((a, b) => Number(b === 'word/document.xml') - Number(a === 'word/document.xml') || a.localeCompare(b))
  if (!parts.includes('word/document.xml')) throw new Error('Not a Word document (word/document.xml missing)')
  const xml = new Map<string, string>()
  const paragraphs: Paragraph[] = []
  for (const part of parts) {
    const content = await zip.file(part)!.async('string')
    xml.set(part, content)
    scanPart(part, content, paragraphs)
  }
  const numbering = readNumbering(await zip.file('word/numbering.xml')?.async('string'))
  return { paragraphs, xml, zip, numbering }
}

/** Paragraphes traduits (ceux qui contiennent des lettres), dans l'ordre : ce sont les segments envoyés au modèle. */
export function docxSegments(doc: DocxContent): string[] {
  return doc.paragraphs.map(p => p.text)
}

function headingLevel(style: string | null): 1 | 2 | null {
  if (!style) return null
  if (/^(title|titre|titel|titolo)$/i.test(style)) return 1
  const m = /(heading|titre|berschrift|titolo|title)\s*(\d)/i.exec(style)
  if (!m) return null
  return m[2] === '1' ? 1 : 2
}

/**
 * Blocs affichés à l'écran (corps du document seulement) : titres, paragraphes, éléments de liste (« • » ou
 * « 1. » selon numbering.xml), tableaux. `texts` : texte de chaque paragraphe (original ou traduit), même ordre.
 */
export function docxBlocks(doc: DocxContent, texts: string[]): Block[] {
  const blocks: Block[] = []
  const counters = new Map<string, number>()
  let table: { index: number; block: Extract<Block, { type: 'table' }> } | null = null

  doc.paragraphs.forEach((p, i) => {
    if (p.part !== 'word/document.xml') return
    const text = (texts[i] ?? '').trim()
    if (p.cell) {
      const [index, row, cell] = p.cell
      if (!table || table.index !== index) {
        table = { index, block: { type: 'table', headers: [], rows: [] } }
        blocks.push(table.block)
      }
      const rows = table.block.rows
      while (rows.length <= row) rows.push([])
      while (rows[row].length <= cell) rows[row].push('')
      if (text) rows[row][cell] = rows[row][cell] ? `${rows[row][cell]} ${text}` : text
      return
    }
    table = null
    if (!text) return
    const level = headingLevel(p.style)
    if (level) { blocks.push({ type: 'heading', level, text }); return }
    if (p.num && p.num.id && p.num.id !== '0') {   // numId 0 = numérotation retirée
      const fmt = doc.numbering.get(p.num.id)?.[p.num.level] ?? 'bullet'
      const key = `${p.num.id}:${p.num.level}`
      const n = (counters.get(key) ?? 0) + 1
      counters.set(key, n)
      const indent = '  '.repeat(p.num.level)
      blocks.push({ type: 'paragraph', text: `${indent}${fmt === 'bullet' || fmt === 'none' ? '•' : `${n}.`} ${text}` })
      return
    }
    blocks.push({ type: 'paragraph', text })
  })

  // Lignes de longueurs inégales (cellules fusionnées) : complétées pour former un tableau rectangulaire
  for (const b of blocks) {
    if (b.type !== 'table') continue
    const width = Math.max(0, ...b.rows.map(r => r.length))
    b.rows = b.rows.map(r => [...r, ...Array<string>(width - r.length).fill('')])
  }
  return blocks
}

/** DOCX d'origine dont le texte de chaque paragraphe est remplacé par `texts` (même ordre que les paragraphes). */
export async function writeDocx(doc: DocxContent, texts: string[]): Promise<Buffer> {
  const edits = new Map<string, { start: number; end: number; value: string }[]>()
  doc.paragraphs.forEach((p, i) => {
    const text = texts[i]
    if (text === undefined || text === p.text || !p.runs.length) return
    const list = edits.get(p.part) ?? []
    p.runs.forEach((r, k) => {
      // 1er <w:t> : toute la traduction, espaces conservés ; les suivants : vidés
      const open = k === 0 && !/xml:space=/.test(doc.xml.get(p.part)!.slice(r.openStart, r.openEnd))
        ? '<w:t xml:space="preserve">'
        : doc.xml.get(p.part)!.slice(r.openStart, r.openEnd)
      list.push({ start: r.openStart, end: r.closeStart, value: open + (k === 0 ? encodeXml(text) : '') })
    })
    edits.set(p.part, list)
  })

  for (const [part, list] of edits) {
    let xml = doc.xml.get(part)!
    for (const e of list.sort((a, b) => b.start - a.start)) xml = xml.slice(0, e.start) + e.value + xml.slice(e.end)
    doc.zip.file(part, xml)
  }
  return doc.zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

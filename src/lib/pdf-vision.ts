// Server-only — OCR de PDFs scannés via Ollama vision
// Convertit chaque page en PNG via pdfjs-dist + @napi-rs/canvas, puis appelle callOllama
// LightOnOCR-2 retourne du texte/Markdown avec des tableaux en HTML — on parse les deux

import { callOllama } from '@/lib/ollama'
import { buildOcrPrompt } from '@/lib/prompts'
import { textToBlocks } from '@/lib/file-parser'
import type { Block } from '@/types/leksis'

function stripInlineHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .trim()
}

function parseHtmlTable(html: string): Extract<Block, { type: 'table' }> | null {
  const headers: string[] = []
  const rows: string[][] = []

  const theadMatch = html.match(/<thead[\s\S]*?<\/thead>/i)
  const tbodyMatch = html.match(/<tbody[\s\S]*?<\/tbody>/i)

  if (theadMatch) {
    const thMatches = [...theadMatch[0].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)]
    thMatches.forEach(m => headers.push(stripInlineHtml(m[1])))
  }

  const rowSource = tbodyMatch ? tbodyMatch[0] : html
  const trMatches = [...rowSource.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
  trMatches.forEach(tr => {
    const cells = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
    if (cells.length) rows.push(cells.map(c => stripInlineHtml(c[1])))
  })

  if (!headers.length && !rows.length) return null
  return { type: 'table', headers, rows }
}

/**
 * Parse le texte brut retourné par LightOnOCR-2.
 * Le modèle mélange du texte/Markdown ordinaire et des tableaux en HTML.
 * On sépare les deux et on convertit chacun en blocks appropriés.
 */
function parseOcrOutput(text: string): Block[] {
  const blocks: Block[] = []

  // Séparer le texte sur les frontières <table>...</table>
  const parts = text.split(/(<table[\s\S]*?<\/table>)/gi)

  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed) continue

    if (/^<table/i.test(trimmed)) {
      const tableBlock = parseHtmlTable(trimmed)
      if (tableBlock) blocks.push(tableBlock)
    } else {
      blocks.push(...textToBlocks(trimmed))
    }
  }

  return blocks
}

export async function parsePdfWithVision(buffer: Buffer, signal?: AbortSignal, model?: string, baseUrl?: string): Promise<Block[]> {
  // Import dynamique pour éviter les problèmes de bundling côté client
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs' as string) as typeof import('pdfjs-dist')
  const { createCanvas } = await import('@napi-rs/canvas')

  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise

  const allBlocks: Block[] = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale: 1.5 }) // ~150 DPI

    const canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height))
    const ctx = canvas.getContext('2d')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await page.render({ canvasContext: ctx as any, viewport } as any).promise

    const base64 = canvas.toBuffer('image/png').toString('base64')

    const pageOutput = await callOllama({
      prompt: buildOcrPrompt(),
      images: [base64],
      signal,
      model,
      baseUrl,
    })

    if (pageOutput.trim()) {
      if (allBlocks.length > 0) allBlocks.push({ type: 'page-break' })
      allBlocks.push(...parseOcrOutput(pageOutput.trim()))
    }
  }

  return allBlocks
}

// Server-only — OCR de PDFs scannés via un modèle vision (Ollama ou API OpenAI-compatible)
// Convertit chaque page en PNG via pdfjs-dist + @napi-rs/canvas, puis appelle provider.complete
// LightOnOCR-2 retourne du texte/Markdown avec des tableaux en HTML — on parse les deux

import type { LlmProvider } from '@/lib/llm/types'
import { buildOcrPrompt } from '@/lib/prompts'
import { textToBlocks, parseHtmlTable } from '@/lib/file-parser'
import { OCR_MAX_PDF_PAGES } from '@/lib/validators'
import type { Block } from '@/types/leksis'

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

/** Levée quand un PDF scanné dépasse le nombre de pages admis : message affichable à l'utilisateur. */
export class PdfPageLimitError extends Error {
  constructor(public pages: number, public maxPages: number) {
    super(`This scanned PDF has ${pages} pages; the limit is ${maxPages} pages.`)
    this.name = 'PdfPageLimitError'
  }
}

export async function parsePdfWithVision(buffer: Buffer, provider: LlmProvider, model: string, signal?: AbortSignal): Promise<Block[]> {
  // Import dynamique pour éviter les problèmes de bundling côté client
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs' as string) as typeof import('pdfjs-dist')
  const { createCanvas } = await import('@napi-rs/canvas')

  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise

  try {
    // Une page = un appel au modèle vision, l'un après l'autre : on plafonne avant de commencer
    if (pdf.numPages > OCR_MAX_PDF_PAGES) throw new PdfPageLimitError(pdf.numPages, OCR_MAX_PDF_PAGES)

    const allBlocks: Block[] = []

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const viewport = page.getViewport({ scale: 1.5 }) // ~150 DPI

      const canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height))
      const ctx = canvas.getContext('2d')

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await page.render({ canvasContext: ctx as any, viewport } as any).promise

      const base64 = canvas.toBuffer('image/png').toString('base64')
      page.cleanup()

      const pageOutput = await provider.complete({
        prompt: buildOcrPrompt(),
        images: [base64],
        signal,
        model,
      })

      if (pageOutput.trim()) {
        if (allBlocks.length > 0) allBlocks.push({ type: 'page-break' })
        allBlocks.push(...parseOcrOutput(pageOutput.trim()))
      }
    }

    return allBlocks
  } finally {
    await pdf.destroy().catch(() => {})
  }
}

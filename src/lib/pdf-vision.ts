// Server-only — OCR de PDFs scannés via un modèle vision (Ollama ou API OpenAI-compatible)
// Convertit chaque page en PNG via pdfjs-dist + @napi-rs/canvas, puis appelle provider.complete
// LightOnOCR-2 retourne du texte/Markdown avec des tableaux en HTML — on parse les deux

import type { LlmProvider } from '@/lib/llm/types'
import { withAiSlot } from '@/lib/llm/concurrency'
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

/** Pages d'un PDF scanné traitées en même temps. */
const OCR_PARALLEL_PAGES = 2

/** Côté le plus long de l'image envoyée au modèle vision, en pixels. */
export const OCR_MAX_PAGE_PX = 2000

/**
 * Échelle de rendu d'une page : ~150 DPI (1,5), réduite pour que le plus grand côté ne dépasse pas OCR_MAX_PAGE_PX.
 * La taille de page vient du PDF lui-même : sans plafond, une page de 14 400 pt donnait un canvas de 1,8 Go.
 */
export function renderScale(page: { width: number; height: number }): number {
  const longest = Math.max(page.width, page.height, 1)
  return Math.min(1.5, OCR_MAX_PAGE_PX / longest)
}

export async function parsePdfWithVision(buffer: Buffer, provider: LlmProvider, model: string, maxConcurrent: number, signal?: AbortSignal): Promise<Block[]> {
  // Import dynamique pour éviter les problèmes de bundling côté client
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs' as string) as typeof import('pdfjs-dist')
  const { createCanvas } = await import('@napi-rs/canvas')

  // pdfjs-dist v6 : destroy() est sur la tâche de chargement, plus sur le document résolu
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) })
  const pdf = await loadingTask.promise

  try {
    // Une page = un appel au modèle vision : on plafonne avant de commencer
    if (pdf.numPages > OCR_MAX_PDF_PAGES) throw new PdfPageLimitError(pdf.numPages, OCR_MAX_PDF_PAGES)

    // Deux pages à la fois : la suivante est rendue (CPU) pendant que la précédente est lue par le modèle (GPU).
    // Chaque page garde sa place ; l'appel au modèle reste sous la limite de concurrence globale.
    const outputs: string[] = new Array(pdf.numPages)
    let nextPage = 1
    let failed = false
    const worker = async () => {
      while (!failed && nextPage <= pdf.numPages) {
        const i = nextPage++
        try {
          outputs[i - 1] = await ocrPage(i)
        } catch (err) {
          failed = true   // plus aucune nouvelle page : l'extraction échoue de toute façon
          throw err
        }
      }
    }
    const ocrPage = async (i: number): Promise<string> => {
      const page = await pdf.getPage(i)
      const viewport = page.getViewport({ scale: renderScale(page.getViewport({ scale: 1 })) })

      const canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height))
      const ctx = canvas.getContext('2d')

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await page.render({ canvasContext: ctx as any, viewport } as any).promise

      // encode() asynchrone (hors du fil principal) : toBuffer() bloquait toutes les autres requêtes du serveur
      const base64 = (await canvas.encode('png')).toString('base64')
      page.cleanup()

      return withAiSlot(maxConcurrent, () => provider.complete({
        prompt: buildOcrPrompt(),
        images: [base64],
        signal,
        model,
      }), signal)
    }
    await Promise.all(Array.from({ length: Math.min(OCR_PARALLEL_PAGES, pdf.numPages) }, worker))

    const allBlocks: Block[] = []
    for (const pageOutput of outputs) {
      if (!pageOutput?.trim()) continue
      if (allBlocks.length > 0) allBlocks.push({ type: 'page-break' })
      allBlocks.push(...parseOcrOutput(pageOutput.trim()))
    }
    return allBlocks
  } finally {
    await loadingTask.destroy().catch(() => {})
  }
}

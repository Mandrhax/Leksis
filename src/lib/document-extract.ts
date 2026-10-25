import 'server-only'
import { parseFile, parsePdf, isProbablyScanned, countBlockChars } from '@/lib/file-parser'
import { parsePdfWithVision, PdfPageLimitError } from '@/lib/pdf-vision'
import { getAiOrError } from '@/lib/llm'
import { getDynamicLimits } from '@/lib/limits'
import type { ApiError } from '@/lib/validators'
import type { Block } from '@/types/leksis'

// Extraction d'un document envoyé (onglet Document : « Extraire » et « Traduire » partagent ces étapes) :
// analyse du fichier, OCR par le modèle vision si c'est un PDF scanné, puis plafond de caractères.

export type ExtractResult =
  | { blocks: Block[]; charCount: number; error?: undefined }
  | { error: ApiError | Response; status: number; blocks?: undefined }

export async function extractDocumentBlocks(buffer: Buffer, ext: string, filename: string, signal: AbortSignal, logTag: string): Promise<ExtractResult> {
  let blocks: Block[]
  try {
    if (ext === 'pdf') {
      blocks = await parsePdf(buffer)
      if (isProbablyScanned(blocks)) {
        const ai = await getAiOrError()
        if (ai.error) return { error: ai.error, status: ai.error.status }
        const { provider, cfg } = ai.ai
        blocks = await parsePdfWithVision(buffer, provider, cfg.ocrModel, cfg.maxConcurrentAiRequests, signal)
      }
    } else {
      blocks = await parseFile(buffer, filename)
    }
  } catch (err) {
    if (err instanceof PdfPageLimitError) {
      return { status: 400, error: { error: err.message, code: 'page_limit', pages: err.pages, limit: err.maxPages } }
    }
    console.error(`[${logTag}] extraction failed:`, err)
    return { status: 422, error: { error: 'File extraction failed. The file may be corrupted or unsupported.', code: 'extraction_failed' } }
  }

  const { maxDocChars } = await getDynamicLimits()
  const charCount = countBlockChars(blocks)
  if (charCount > maxDocChars) {
    return {
      status: 400,
      error: { error: `Document exceeds the ${maxDocChars} character limit (${charCount} chars).`, code: 'doc_too_long', limit: maxDocChars, count: charCount },
    }
  }
  return { blocks, charCount }
}

import 'server-only'
import { parseFile, parsePdf, parseDocxDocument, isProbablyScanned, countBlockChars } from '@/lib/file-parser'
import { docxSegments, type DocxContent } from '@/lib/docx-inplace'
import { parsePdfWithVision, PdfPageLimitError } from '@/lib/pdf-vision'
import { getAiOrError } from '@/lib/llm'
import { getDynamicLimits } from '@/lib/limits'
import type { ApiError } from '@/lib/validators'
import type { Block } from '@/types/leksis'

// Extraction d'un document envoyé (onglet Document : « Extraire » et « Traduire » partagent ces étapes) :
// analyse du fichier, OCR par le modèle vision si c'est un PDF scanné, puis plafond de caractères.

export type ExtractResult =
  /** `docx` : fichier Word lu dans son XML, pour y réécrire la traduction (mise en page conservée) */
  | { blocks: Block[]; charCount: number; docx?: DocxContent; error?: undefined }
  | { error: ApiError | Response; status: number; blocks?: undefined }

export async function extractDocumentBlocks(buffer: Buffer, ext: string, filename: string, signal: AbortSignal, logTag: string): Promise<ExtractResult> {
  let blocks: Block[]
  let docx: DocxContent | undefined
  try {
    if (ext === 'pdf') {
      blocks = await parsePdf(buffer)
      if (isProbablyScanned(blocks)) {
        const ai = await getAiOrError()
        if (ai.error) return { error: ai.error, status: ai.error.status }
        const { provider, cfg } = ai.ai
        try {
          blocks = await parsePdfWithVision(buffer, provider, cfg.ocrModel, cfg.maxConcurrentAiRequests, signal)
        } catch (err) {
          if (err instanceof PdfPageLimitError) throw err
          // PDF scanné (des images, pas de texte) : seul le modèle OCR pouvait le lire. Le plus souvent, ce modèle ne
          // sait pas lire les images (modèle texte seulement) — dire « fichier endommagé » égarait l'utilisateur.
          console.error(`[${logTag}] OCR of a scanned PDF failed (model ${cfg.ocrModel}):`, err)
          return { status: 422, error: { error: 'This PDF is a scan: reading it needs an AI model that can read images (OCR), and the AI server could not read it.', code: 'ocr_failed' } }
        }
      }
    } else if (ext === 'docx') {
      const parsed = await parseDocxDocument(buffer)
      blocks = parsed.blocks
      docx = parsed.doc
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
  // DOCX : tout ce qui sera traduit compte, en-têtes et pieds de page compris
  const charCount = docx ? docxSegments(docx).join('').length : countBlockChars(blocks)
  if (charCount > maxDocChars) {
    return {
      status: 400,
      error: { error: `Document exceeds the ${maxDocChars} character limit (${charCount} chars).`, code: 'doc_too_long', limit: maxDocChars, count: charCount },
    }
  }
  return { blocks, charCount, docx }
}

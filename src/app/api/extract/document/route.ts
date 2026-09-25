import { NextRequest, NextResponse } from 'next/server'
import { parseFile, parsePdf, isProbablyScanned, countBlockChars } from '@/lib/file-parser'
import { parsePdfWithVision, PdfPageLimitError } from '@/lib/pdf-vision'
import { getAiOrError } from '@/lib/llm'
import { getDynamicLimits } from '@/lib/limits'
import { isFeatureEnabled } from '@/lib/features-guard'
import { requireUser } from '@/lib/user-guard'
import { validateFileExtension, validateDocumentSize, requestTooLarge, DOCUMENT_MAX_BYTES } from '@/lib/validators'

export const maxDuration = 300

export async function POST(req: NextRequest) {
  const guard = await requireUser({ rateLimit: true })
  if (guard.error) return guard.error

  if (!await isFeatureEnabled('document')) {
    return NextResponse.json({ error: 'This feature is disabled.' }, { status: 403 })
  }

  // Refus avant de lire le corps : évite de charger un fichier énorme en mémoire
  if (requestTooLarge(req, DOCUMENT_MAX_BYTES)) {
    return NextResponse.json({ error: validateDocumentSize(Infinity) }, { status: 413 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data.' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided.' }, { status: 400 })

  const sizeError = validateDocumentSize(file.size)
  if (sizeError) return NextResponse.json({ error: sizeError }, { status: 413 })

  const { ext, error: extError } = validateFileExtension(file.name)
  if (extError) return NextResponse.json({ error: extError }, { status: 400 })

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  let blocks
  try {
    if (ext === 'pdf') {
      blocks = await parsePdf(buffer)
      if (isProbablyScanned(blocks)) {
        const ai = await getAiOrError()
        if (ai.error) return ai.error
        blocks = await parsePdfWithVision(buffer, ai.ai.provider, ai.ai.cfg.ocrModel, req.signal)
      }
    } else {
      blocks = await parseFile(buffer, file.name)
    }
  } catch (err) {
    if (err instanceof PdfPageLimitError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    console.error('[extract/document] extraction failed:', err)
    return NextResponse.json({ error: 'File extraction failed. The file may be corrupted or unsupported.' }, { status: 422 })
  }

  const { maxDocChars } = await getDynamicLimits()
  const charCount = countBlockChars(blocks)
  if (charCount > maxDocChars) {
    return NextResponse.json({
      error: `Document exceeds the ${maxDocChars} character limit (${charCount} chars).`,
    }, { status: 400 })
  }

  return NextResponse.json({ blocks })
}

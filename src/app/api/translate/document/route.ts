import { NextRequest, NextResponse } from 'next/server'
import { getAiOrError } from '@/lib/llm'
import { buildDocumentTranslationPrompt } from '@/lib/prompts'

export const maxDuration = 300
import { parseFile, parsePdf, isProbablyScanned, flattenBlocks, applyTranslatedSegments, countBlockChars } from '@/lib/file-parser'
import { parsePdfWithVision, PdfPageLimitError } from '@/lib/pdf-vision'
import { getDynamicLimits } from '@/lib/limits'
import { logUsage } from '@/lib/usage'
import { isFeatureEnabled } from '@/lib/features-guard'
import { requireUser } from '@/lib/user-guard'
import {
  validateFileExtension, validateDocumentSize, requestTooLarge,
  isValidLangName, DOCUMENT_MAX_BYTES,
} from '@/lib/validators'

export async function POST(req: NextRequest) {
  const guard = await requireUser({ rateLimit: true })
  if (guard.error) return guard.error
  const { session } = guard

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
  const targetLang = formData.get('targetLang') as string | null
  const sourceLang = formData.get('sourceLang') as string | null

  if (!file) return NextResponse.json({ error: 'No file provided.' }, { status: 400 })
  if (!targetLang) return NextResponse.json({ error: 'Target language is required.' }, { status: 400 })
  if (!isValidLangName(targetLang) || (sourceLang && !isValidLangName(sourceLang))) {
    return NextResponse.json({ error: 'Invalid language.' }, { status: 400 })
  }

  const sizeError = validateDocumentSize(file.size)
  if (sizeError) return NextResponse.json({ error: sizeError }, { status: 413 })

  const { ext, error: extError } = validateFileExtension(file.name)
  if (extError) return NextResponse.json({ error: extError }, { status: 400 })

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const aiResult = await getAiOrError()
  if (aiResult.error) return aiResult.error
  const { cfg, provider } = aiResult.ai

  let blocks
  try {
    if (ext === 'pdf') {
      blocks = await parsePdf(buffer)
      if (isProbablyScanned(blocks)) {
        blocks = await parsePdfWithVision(buffer, provider, cfg.ocrModel, req.signal)
      }
    } else {
      blocks = await parseFile(buffer, file.name)
    }
  } catch (err) {
    if (err instanceof PdfPageLimitError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    console.error('[translate/document] extraction failed:', err)
    return NextResponse.json({ error: 'File extraction failed. The file may be corrupted or unsupported.' }, { status: 422 })
  }

  const { maxDocChars } = await getDynamicLimits()
  const charCount = countBlockChars(blocks)
  if (charCount > maxDocChars) {
    return NextResponse.json({
      error: `Document exceeds the ${maxDocChars} character limit (${charCount} chars).`,
    }, { status: 400 })
  }

  const segments = flattenBlocks(blocks)

  const prompt = buildDocumentTranslationPrompt({
    segments,
    sourceLang: sourceLang || 'Auto',
    targetLang,
  })

  let translated: string
  try {
    translated = await provider.complete({ prompt, signal: req.signal, model: cfg.translationModel })
  } catch (err) {
    console.error('[translate/document] translation failed:', err)
    return NextResponse.json({ error: 'Translation failed. The AI server did not return a result.' }, { status: 502 })
  }

  logUsage({
    userId:    session.user.id,
    userEmail: session.user.email ?? 'unknown',
    feature:   'document',
    sourceLang: sourceLang ?? 'auto',
    targetLang,
    model:     cfg.translationModel,
    charCount,
  })

  const translatedBlocks = applyTranslatedSegments(blocks, translated)

  return NextResponse.json({ blocks: translatedBlocks })
}

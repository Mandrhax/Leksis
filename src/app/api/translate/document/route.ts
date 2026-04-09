import { NextRequest, NextResponse } from 'next/server'
import { callOllama, getOllamaConfig } from '@/lib/ollama'
import { buildDocumentTranslationPrompt } from '@/lib/prompts'

export const maxDuration = 300
import { parseFile, parsePdf, isProbablyScanned, flattenBlocks, applyTranslatedSegments, countBlockChars } from '@/lib/file-parser'
import { parsePdfWithVision } from '@/lib/pdf-vision'
import { getDynamicLimits } from '@/lib/limits'
import { logUsage } from '@/lib/usage'
import { isFeatureEnabled } from '@/lib/features-guard'
import { auth } from '@/auth'

export async function POST(req: NextRequest) {
  if (!await isFeatureEnabled('document')) {
    return NextResponse.json({ error: 'This feature is disabled.' }, { status: 403 })
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

  const supportedExts = ['pdf', 'docx', 'doc', 'txt', 'csv']
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!supportedExts.includes(ext)) {
    return NextResponse.json({ error: `Unsupported file type: .${ext}` }, { status: 400 })
  }

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  let blocks
  try {
    if (ext === 'pdf') {
      blocks = await parsePdf(buffer)
      if (isProbablyScanned(blocks)) {
        const { ocrModel, baseUrl: docBaseUrl } = await getOllamaConfig()
        blocks = await parsePdfWithVision(buffer, req.signal, ocrModel, docBaseUrl)
      }
    } else {
      blocks = await parseFile(buffer, file.name)
    }
  } catch (err) {
    return NextResponse.json({ error: `File extraction failed: ${(err as Error).message}` }, { status: 422 })
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

  const [cfg, session] = await Promise.all([getOllamaConfig(), auth()])

  let translated: string
  try {
    translated = await callOllama({ prompt, signal: req.signal, model: cfg.translationModel, baseUrl: cfg.baseUrl })
  } catch (err) {
    return NextResponse.json({ error: `Translation failed: ${(err as Error).message}` }, { status: 502 })
  }

  logUsage({
    userId:    session?.user?.id,
    userEmail: session?.user?.email ?? 'anonymous',
    feature:   'document',
    sourceLang: sourceLang ?? 'auto',
    targetLang,
    model:     cfg.translationModel,
    charCount,
  })

  const translatedBlocks = applyTranslatedSegments(blocks, translated)

  return NextResponse.json({ blocks: translatedBlocks })
}

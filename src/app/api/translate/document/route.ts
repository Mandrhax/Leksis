import { NextRequest, NextResponse } from 'next/server'
import { getAiOrError } from '@/lib/llm'
import { buildDocumentTranslationPrompt, buildDelimitedTranslationPrompt, isDelimitedModel } from '@/lib/prompts'

export const maxDuration = 300
import {
  parseFile, parsePdf, isProbablyScanned, flattenBlocks, flattenBlocksPlain,
  applyTranslatedSegments, textToBlocks, countBlockChars,
} from '@/lib/file-parser'
import { parsePdfWithVision } from '@/lib/pdf-vision'
import { getDynamicLimits } from '@/lib/limits'
import { logUsage } from '@/lib/usage'
import { isFeatureEnabled } from '@/lib/features-guard'
import { validateFileExtension } from '@/lib/validators'
import { detectLanguage } from '@/lib/languages'
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
  const targetCode = formData.get('targetCode') as string | null
  const sourceCode = formData.get('sourceCode') as string | null

  if (!file) return NextResponse.json({ error: 'No file provided.' }, { status: 400 })
  if (!targetLang) return NextResponse.json({ error: 'Target language is required.' }, { status: 400 })

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
    return NextResponse.json({ error: `File extraction failed: ${(err as Error).message}` }, { status: 422 })
  }

  const { maxDocChars } = await getDynamicLimits()
  const charCount = countBlockChars(blocks)
  if (charCount > maxDocChars) {
    return NextResponse.json({
      error: `Document exceeds the ${maxDocChars} character limit (${charCount} chars).`,
    }, { status: 400 })
  }

  const session = await auth()

  let translated: string
  let translatedBlocks

  if (isDelimitedModel(cfg.provider, cfg.translationModel)) {
    // Un seul bloc de texte, sans séparateurs |||: pas de reconstruction de
    // structure pour l'instant (tableaux/titres) — à retravailler plus tard.
    const flatText = flattenBlocksPlain(blocks)
    const effectiveSourceCode = sourceCode || detectLanguage(flatText)?.code
    if (!effectiveSourceCode) {
      return NextResponse.json({ error: 'Could not determine the source language.' }, { status: 400 })
    }
    if (!targetCode) {
      return NextResponse.json({ error: 'Target language code is required.' }, { status: 400 })
    }

    try {
      translated = await provider.complete({
        prompt: buildDelimitedTranslationPrompt({ sourceCode: effectiveSourceCode, targetCode, text: flatText }),
        signal: req.signal,
        model: cfg.translationModel,
      })
    } catch (err) {
      return NextResponse.json({ error: `Translation failed: ${(err as Error).message}` }, { status: 502 })
    }

    translatedBlocks = textToBlocks(translated)
  } else {
    const segments = flattenBlocks(blocks)
    const prompt = buildDocumentTranslationPrompt({
      segments,
      sourceLang: sourceLang || 'Auto',
      targetLang,
    })

    try {
      translated = await provider.complete({ prompt, signal: req.signal, model: cfg.translationModel })
    } catch (err) {
      return NextResponse.json({ error: `Translation failed: ${(err as Error).message}` }, { status: 502 })
    }

    translatedBlocks = applyTranslatedSegments(blocks, translated)
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

  return NextResponse.json({ blocks: translatedBlocks })
}

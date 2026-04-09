import { NextRequest, NextResponse } from 'next/server'
import { streamOllamaResponse, getOllamaConfig } from '@/lib/ollama'
import { buildTranslationPrompt, buildMarkdownTranslationPrompt } from '@/lib/prompts'
import { validateTextInput } from '@/lib/validators'
import { getDynamicLimits } from '@/lib/limits'
import { logUsage } from '@/lib/usage'
import { isFeatureEnabled } from '@/lib/features-guard'
import { auth } from '@/auth'
import type { Formality } from '@/types/leksis'

export async function POST(req: NextRequest) {
  if (!await isFeatureEnabled('text')) {
    return NextResponse.json({ error: 'This feature is disabled.' }, { status: 403 })
  }
  let body: {
    text: string
    sourceLang: string
    sourceCode: string
    targetLang: string
    targetCode: string
    formality?: Formality | null
    glossaryClause?: string
    markdownMode?: boolean
  }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const { text, sourceLang, sourceCode, targetLang, targetCode, formality, glossaryClause, markdownMode } = body

  const { maxTextChars } = await getDynamicLimits()
  const validationError = validateTextInput(text, maxTextChars)
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 })
  }

  if (!targetLang || !targetCode) {
    return NextResponse.json({ error: 'Target language is required.' }, { status: 400 })
  }

  const prompt = markdownMode
    ? buildMarkdownTranslationPrompt({ sourceLang: sourceLang || 'Unknown', targetLang, text })
    : buildTranslationPrompt({
        sourceLang: sourceLang || 'Unknown',
        sourceCode: sourceCode || 'auto',
        targetLang,
        targetCode,
        formality,
        glossaryClause,
        text,
      })

  const [cfg, session] = await Promise.all([getOllamaConfig(), auth()])

  logUsage({
    userId:    session?.user?.id,
    userEmail: session?.user?.email ?? 'anonymous',
    feature:   'text',
    sourceLang: sourceCode || 'auto',
    targetLang: targetCode,
    model:     cfg.translationModel,
    charCount: text.length,
  })

  const stream = streamOllamaResponse({ prompt, signal: req.signal, model: cfg.translationModel, baseUrl: cfg.baseUrl })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

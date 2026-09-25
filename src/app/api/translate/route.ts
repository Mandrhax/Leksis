import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 300 // 5 min — needed for large model cold-start + long texts
import { getAiOrError } from '@/lib/llm'
import { buildTranslationPrompt, buildMarkdownTranslationPrompt } from '@/lib/prompts'
import { validateTextInput, isValidLangName, isValidLangCode } from '@/lib/validators'
import { getDynamicLimits } from '@/lib/limits'
import { logUsage } from '@/lib/usage'
import { isFeatureEnabled } from '@/lib/features-guard'
import { requireUser } from '@/lib/user-guard'
import { fetchGlossaryEntries, buildTranslationGlossaryClause } from '@/lib/glossary'
import type { Formality } from '@/types/leksis'

export async function POST(req: NextRequest) {
  const guard = await requireUser({ rateLimit: true })
  if (guard.error) return guard.error
  const { session } = guard

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
    markdownMode?: boolean
  }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const { text, sourceLang, sourceCode, targetLang, targetCode, formality, markdownMode } = body

  const { maxTextChars } = await getDynamicLimits()
  const validationError = validateTextInput(text, maxTextChars)
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 })
  }

  if (!targetLang || !targetCode) {
    return NextResponse.json({ error: 'Target language is required.' }, { status: 400 })
  }

  // Ces valeurs sont insérées telles quelles dans le prompt : format strict
  if (
    !isValidLangName(targetLang) || !isValidLangCode(targetCode) ||
    (sourceLang && !isValidLangName(sourceLang)) || (sourceCode && !isValidLangCode(sourceCode))
  ) {
    return NextResponse.json({ error: 'Invalid language.' }, { status: 400 })
  }
  if (formality != null && formality !== 'Formal' && formality !== 'Informal') {
    return NextResponse.json({ error: 'Invalid formality.' }, { status: 400 })
  }

  const ai = await getAiOrError()
  if (ai.error) return ai.error
  const { cfg, provider } = ai.ai

  // Fetch glossary server-side (respects user preferences)
  const glossaryEntries = await fetchGlossaryEntries(
    session.user.id,
    sourceCode || 'auto',
    targetCode,
    text,
  )
  const glossaryClause = buildTranslationGlossaryClause(glossaryEntries)

  const prompt = markdownMode === true
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

  logUsage({
    userId:    session.user.id,
    userEmail: session.user.email ?? 'unknown',
    feature:   'text',
    sourceLang: sourceCode || 'auto',
    targetLang: targetCode,
    model:     cfg.translationModel,
    charCount: text.length,
  })

  const stream = provider.stream({ prompt, signal: req.signal, model: cfg.translationModel })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

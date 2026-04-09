import { NextRequest, NextResponse } from 'next/server'
import { streamOllamaResponse, getOllamaConfig } from '@/lib/ollama'
import { buildRewritePrompt, buildCorrectPrompt, buildLangClause } from '@/lib/prompts'
import { validateTextInput } from '@/lib/validators'
import { getDynamicLimits } from '@/lib/limits'
import { logUsage } from '@/lib/usage'
import { isFeatureEnabled } from '@/lib/features-guard'
import { auth } from '@/auth'
import type { RewriteMode, RewriteTone, RewriteLength } from '@/types/leksis'

export async function POST(req: NextRequest) {
  if (!await isFeatureEnabled('rewrite')) {
    return NextResponse.json({ error: 'This feature is disabled.' }, { status: 403 })
  }
  let body: {
    text: string
    mode: RewriteMode
    tone?: RewriteTone
    length?: RewriteLength
    glossaryClause?: string
    sourceLang?: string
  }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const { text, mode, tone, length, glossaryClause, sourceLang } = body

  const { maxTextChars } = await getDynamicLimits()
  const validationError = validateTextInput(text, maxTextChars)
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 })
  }

  if (!mode || (mode !== 'rewrite' && mode !== 'correct')) {
    return NextResponse.json({ error: 'Invalid mode. Use "rewrite" or "correct".' }, { status: 400 })
  }

  const langClause = buildLangClause(sourceLang || 'the same language as the input')

  const { system, prompt } = mode === 'correct'
    ? buildCorrectPrompt({ langClause, glossaryClause, text })
    : buildRewritePrompt({
        tone: tone || 'Professional',
        length: length || 'Keep',
        langClause,
        glossaryClause,
        text,
      })

  const [cfg, session] = await Promise.all([getOllamaConfig(), auth()])

  logUsage({
    userId:    session?.user?.id,
    userEmail: session?.user?.email ?? 'anonymous',
    feature:   'rewrite',
    sourceLang: sourceLang,
    model:     cfg.rewriteModel,
    charCount: text.length,
  })

  const stream = streamOllamaResponse({ system, prompt, signal: req.signal, model: cfg.rewriteModel, baseUrl: cfg.baseUrl })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

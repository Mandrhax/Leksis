import { NextRequest, NextResponse } from 'next/server'
import { streamOllamaResponse, getOllamaConfig } from '@/lib/ollama'
import { buildRewritePrompt, buildCorrectPrompt, buildLangClause } from '@/lib/prompts'

export const maxDuration = 300
import { validateTextInput } from '@/lib/validators'
import { getDynamicLimits } from '@/lib/limits'
import { logUsage } from '@/lib/usage'
import { isFeatureEnabled } from '@/lib/features-guard'
import { auth } from '@/auth'
import { getConfiguredTones } from '@/lib/tones'
import { fetchGlossaryEntries, buildRewriteGlossaryClause } from '@/lib/glossary'
import type { RewriteMode, RewriteLength } from '@/types/leksis'

export async function POST(req: NextRequest) {
  if (!await isFeatureEnabled('rewrite')) {
    return NextResponse.json({ error: 'This feature is disabled.' }, { status: 403 })
  }
  let body: {
    text: string
    mode: RewriteMode
    tone?: string
    length?: RewriteLength
    sourceLang?: string
  }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const { text, mode, tone, length, sourceLang } = body

  const { maxTextChars } = await getDynamicLimits()
  const validationError = validateTextInput(text, maxTextChars)
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 })
  }

  if (!mode || (mode !== 'rewrite' && mode !== 'correct')) {
    return NextResponse.json({ error: 'Invalid mode. Use "rewrite" or "correct".' }, { status: 400 })
  }

  const langClause = buildLangClause(sourceLang || 'the same language as the input')

  let toneInstruction = 'in a professional, formal tone'
  if (mode === 'rewrite') {
    const tones = await getConfiguredTones()
    const incomingId = (tone ?? 'professional').toLowerCase()
    const matched = tones.find(t => t.id === incomingId && t.enabled !== false)
    if (!matched) {
      return NextResponse.json({ error: 'Invalid tone.' }, { status: 400 })
    }
    toneInstruction = matched.instruction
  }

  const [cfg, session] = await Promise.all([getOllamaConfig(), auth()])

  // Fetch glossary server-side — rewrite is same-language, so only use "any → any" entries
  const glossaryEntries = await fetchGlossaryEntries(
    session?.user?.id,
    '',
    '',
    text,
    true, // nullLangOnly: only brand/product names that apply regardless of language
  )
  const glossaryClause = buildRewriteGlossaryClause(glossaryEntries)

  const { system, prompt } = mode === 'correct'
    ? buildCorrectPrompt({ langClause, glossaryClause, text })
    : buildRewritePrompt({
        instruction: toneInstruction,
        length: length || 'Keep',
        langClause,
        glossaryClause,
        text,
      })

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

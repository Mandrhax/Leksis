import { NextRequest, NextResponse } from 'next/server'
import { getAiOrError, gateStream } from '@/lib/llm'
import { buildTranslationPrompt, buildMarkdownTranslationPrompt } from '@/lib/prompts'
import { validateTextInput, isValidLangName, isValidLangCode } from '@/lib/validators'
import { getDynamicLimits, getTextTranslationConfig } from '@/lib/limits'
import { logUsage, trackUsageStream, type UsageEntry } from '@/lib/usage'
import { translationCache } from '@/lib/translation-cache'
import { translateIncremental } from '@/lib/translate-incremental'
import { sameBaseLanguage } from '@/lib/languages'
import { UsageTrackingSchema } from '@/lib/usage-schema'
import { isFeatureEnabled } from '@/lib/features-guard'
import { requireUser } from '@/lib/user-guard'
import { fetchGlossaryCandidates, filterRelevantTerms, buildTranslationGlossaryClause } from '@/lib/glossary'
import type { Formality } from '@/types/leksis'

export async function POST(req: NextRequest) {
  const startedAt = Date.now()
  const guard = await requireUser({ rateLimit: true })
  if (guard.error) return guard.error
  const { session } = guard

  if (!await isFeatureEnabled('text')) {
    return NextResponse.json({ error: 'This feature is disabled.', code: 'disabled' }, { status: 403 })
  }
  let body: {
    text: string
    sourceLang: string
    sourceCode: string
    targetLang: string
    targetCode: string
    formality?: Formality | null
    markdownMode?: boolean
    trigger?: unknown
    requestGroupId?: unknown
  }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const { text, sourceLang, sourceCode, targetLang, targetCode, formality, markdownMode } = body
  const tracking = UsageTrackingSchema.parse({ trigger: body.trigger, requestGroupId: body.requestGroupId })

  const { maxTextChars } = await getDynamicLimits()
  const validationError = validateTextInput(text, maxTextChars)
  if (validationError) {
    return NextResponse.json(validationError, { status: 400 })
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

  // Défense en profondeur (l'onglet Texte ne l'envoie déjà plus) : fr → fr-CH ne ferait que recopier le texte
  if (sameBaseLanguage(sourceCode, targetCode)) {
    logUsage({
      userId: session.user.id, userEmail: session.user.email ?? 'unknown', feature: 'text',
      sourceLang: sourceCode, targetLang: targetCode, charCount: text.length, modelChars: 0,
      status: 'skipped', latencyMs: Date.now() - startedAt, ...tracking,
    })
    return NextResponse.json({ error: 'Source and target are the same language.', code: 'same_language' }, { status: 400 })
  }

  const ai = await getAiOrError()
  if (ai.error) return ai.error
  const { cfg, provider } = ai.ai

  // Glossaire lu côté serveur (préférences de l'utilisateur) une fois, puis filtré sur chaque texte envoyé :
  // texte entier ou paragraphe retraduit seul
  const glossaryCandidates = await fetchGlossaryCandidates(session.user.id, sourceCode || 'auto', targetCode)

  const buildPrompt = (part: string, context?: string) => markdownMode === true
    ? buildMarkdownTranslationPrompt({ sourceLang: sourceLang || 'Unknown', targetLang, text: part })
    : buildTranslationPrompt({
        sourceLang: sourceLang || 'Unknown',
        sourceCode: sourceCode || 'auto',
        targetLang,
        targetCode,
        formality,
        glossaryClause: buildTranslationGlossaryClause(filterRelevantTerms(glossaryCandidates, part)),
        text: part,
        context,
      })

  const usage: UsageEntry = {
    userId:     session.user.id,
    userEmail:  session.user.email ?? 'unknown',
    feature:    'text',
    sourceLang: sourceCode || 'auto',
    targetLang: targetCode,
    model:      cfg.translationModel,
    charCount:  text.length,
    ...tracking,
  }

  // Cache en mémoire par utilisateur + paragraphes inchangés non renvoyés au modèle (lib/translate-incremental.ts)
  const textCfg = await getTextTranslationConfig()
  const translated = translateIncremental({
    text,
    userId:         session.user.id,
    model:          cfg.translationModel,
    buildPrompt,
    stream:         prompt => gateStream(cfg.maxConcurrentAiRequests, req.signal, () =>
      provider.stream({ prompt, signal: req.signal, model: cfg.translationModel })),
    cache:          translationCache,
    limits:         { ttlMinutes: textCfg.cacheTtlMinutes, maxEntries: textCfg.cacheMaxEntries },
    incremental:    markdownMode !== true,
    segmentContext: textCfg.segmentContext,
    usage,
  })
  const stream = trackUsageStream(translated, usage, startedAt)

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

import { NextRequest, NextResponse } from 'next/server'
import { getAiOrError, withAiSlot } from '@/lib/llm'
import { buildDocumentTranslationPrompt } from '@/lib/prompts'
import { blocksToSegments, applySegments } from '@/lib/file-parser'
import { extractDocumentBlocks } from '@/lib/document-extract'
import { detectLanguage } from '@/lib/languages'
import { docxBlocks, docxSegments, writeDocx } from '@/lib/docx-inplace'
import { translateSegments } from '@/lib/doc-translate'
import { fetchGlossaryCandidates, filterRelevantTerms, buildTranslationGlossaryClause } from '@/lib/glossary'
import { logUsage } from '@/lib/usage'
import { isFeatureEnabled } from '@/lib/features-guard'
import { requireUser } from '@/lib/user-guard'
import {
  validateFileExtension, validateDocumentSize, requestTooLarge,
  isValidLangName, isValidLangCode, DOCUMENT_MAX_BYTES,
} from '@/lib/validators'

export async function POST(req: NextRequest) {
  const startedAt = Date.now()
  const guard = await requireUser({ rateLimit: true })
  if (guard.error) return guard.error
  const { session } = guard

  if (!await isFeatureEnabled('document')) {
    return NextResponse.json({ error: 'This feature is disabled.', code: 'disabled' }, { status: 403 })
  }

  // Refus avant de lire le corps : évite de charger un fichier énorme en mémoire
  if (requestTooLarge(req, DOCUMENT_MAX_BYTES)) {
    return NextResponse.json(validateDocumentSize(Infinity)!, { status: 413 })
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
  // Codes de langue (facultatifs) : servent à choisir les termes du glossaire
  const targetCodeRaw = formData.get('targetCode')
  const sourceCodeRaw = formData.get('sourceCode')
  const targetCode = isValidLangCode(targetCodeRaw) ? targetCodeRaw : ''
  const sourceCode = isValidLangCode(sourceCodeRaw) ? sourceCodeRaw : 'auto'
  // Tutoiement / vouvoiement imposé par l'utilisateur ; absent = celui du document d'origine
  const formalityRaw = formData.get('formality')
  const formality = formalityRaw === 'Formal' || formalityRaw === 'Informal' ? formalityRaw : null

  if (!file) return NextResponse.json({ error: 'No file provided.' }, { status: 400 })
  if (!targetLang) return NextResponse.json({ error: 'Target language is required.' }, { status: 400 })
  if (!isValidLangName(targetLang) || (sourceLang && !isValidLangName(sourceLang))) {
    return NextResponse.json({ error: 'Invalid language.' }, { status: 400 })
  }

  const sizeError = validateDocumentSize(file.size)
  if (sizeError) return NextResponse.json(sizeError, { status: 413 })

  const { ext, error: extError } = validateFileExtension(file.name)
  if (extError) return NextResponse.json(extError, { status: 400 })

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const aiResult = await getAiOrError()
  if (aiResult.error) return aiResult.error
  const { cfg, provider } = aiResult.ai

  const extracted = await extractDocumentBlocks(buffer, ext, file.name, req.signal, 'translate/document')
  if (extracted.error) {
    return extracted.error instanceof Response ? extracted.error : NextResponse.json(extracted.error, { status: extracted.status })
  }
  const { blocks, charCount, docx } = extracted
  // DOCX : un segment par paragraphe du XML Word (corps, en-têtes, pieds de page), réécrit ensuite dans le fichier
  const segmentsIn = docx ? docxSegments(docx) : blocksToSegments(blocks)

  // Langue source non choisie : détectée sur le texte extrait — elle sert au prompt (plutôt que « Auto »), au glossaire
  // et au journal, et l'onglet l'affiche (« Détection auto · Français »)
  const detected = !sourceLang || sourceCode === 'auto' ? detectLanguage(segmentsIn.join('\n').slice(0, 4000)) : null
  const srcName = detected?.name ?? sourceLang ?? ''
  const srcCode = detected?.code ?? sourceCode

  // Glossaire de l'utilisateur : les termes admissibles sont lus une fois, puis filtrés lot par lot
  const glossaryCandidates = targetCode
    ? await fetchGlossaryCandidates(session.user.id, srcCode, targetCode)
    : []

  // Codes de langue (et non les noms affichés) dans le journal
  const usage = {
    userId:     session.user.id,
    userEmail:  session.user.email ?? 'unknown',
    feature:    'document' as const,
    sourceLang: srcCode,
    targetLang: targetCode || targetLang,
    model:      cfg.translationModel,
    charCount,
    modelChars: charCount,
  }

  const translate = async (onProgress?: (done: number, total: number) => void) => {
    try {
      const { segments, stats } = await translateSegments(
        segmentsIn,
        (joined, count) => withAiSlot(cfg.maxConcurrentAiRequests, () => provider.complete({
          prompt: buildDocumentTranslationPrompt({
            segments: joined, segmentCount: count, sourceLang: srcName || 'Auto', targetLang, formality,
            glossaryClause: buildTranslationGlossaryClause(filterRelevantTerms(glossaryCandidates, joined)),
          }),
          signal: req.signal,
          model: cfg.translationModel,
        }), req.signal),
        { concurrency: DOC_PARALLEL_BATCHES, onProgress },
      )
      // Le modèle a mal respecté les séparateurs : à savoir pour choisir ou régler le modèle
      if (stats.retries || stats.splits) console.warn(`[translate/document] separators not respected by ${cfg.translationModel}:`, stats)
      logUsage({ ...usage, status: 'completed', latencyMs: Date.now() - startedAt })
      if (docx) {
        // Le fichier d'origine avec la traduction à la place du texte : mise en page, images, styles conservés
        const file = (await writeDocx(docx, segments)).toString('base64')
        return { blocks: docxBlocks(docx, segments), docx: file }
      }
      return { blocks: applySegments(blocks, segments) }
    } catch (err) {
      logUsage({ ...usage, status: req.signal.aborted ? 'cancelled' : 'error', latencyMs: Date.now() - startedAt })
      console.error('[translate/document] translation failed:', err)
      return null
    }
  }
  const failure = { error: 'Translation failed. The AI server did not return a result.', code: 'translation_failed' }

  // Sans « Accept: application/x-ndjson » (scripts, anciens clients) : une seule réponse JSON à la fin
  if (!(req.headers.get('accept') ?? '').includes('application/x-ndjson')) {
    const translated = await translate()
    return translated ? NextResponse.json({ ...translated, detected }) : NextResponse.json(failure, { status: 502 })
  }

  // Une ligne JSON par événement : {"progress":{"done","total"}} à chaque lot terminé, puis {"blocks":[…]} ou
  // {"error","code"} — un long document montre où il en est au lieu d'un simple sablier
  const encoder = new TextEncoder()
  return new Response(new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: object) => {
        try { controller.enqueue(encoder.encode(JSON.stringify(event) + '\n')) } catch { /* client parti */ }
      }
      if (detected) send({ detected })
      const translated = await translate((done, total) => send({ progress: { done, total } }))
      send(translated ?? failure)
      try { controller.close() } catch { /* client parti */ }
    },
  }), { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' } })
}

/** Lots de segments traduits en même temps pour un document (sous la limite de concurrence globale) */
const DOC_PARALLEL_BATCHES = 3

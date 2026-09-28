import { NextRequest, NextResponse } from 'next/server'
import { getAiOrError, withAiSlot } from '@/lib/llm'
import { buildTranscribePrompt } from '@/lib/prompts'

export const maxDuration = 300
import { validateAudioSize, requestTooLarge } from '@/lib/validators'
import { getDynamicLimits } from '@/lib/limits'
import { logUsage } from '@/lib/usage'
import { isFeatureEnabled } from '@/lib/features-guard'
import { requireUser } from '@/lib/user-guard'

const SUPPORTED_TYPES = ['audio/webm', 'audio/mp4', 'audio/wav', 'audio/mpeg', 'audio/ogg']

export async function POST(req: NextRequest) {
  const guard = await requireUser({ rateLimit: true })
  if (guard.error) return guard.error
  const { session } = guard

  // Refus avant de lire le corps : évite de charger un fichier énorme en mémoire
  const { maxAudioBytes } = await getDynamicLimits()
  if (requestTooLarge(req, maxAudioBytes)) {
    return NextResponse.json({ error: validateAudioSize(Infinity, maxAudioBytes) }, { status: 413 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data.' }, { status: 400 })
  }

  // La dictée est une méthode de saisie pour Texte et Réécriture, pas une fonctionnalité à part :
  // elle reste soumise à l'activation de l'onglet qui l'utilise.
  const feature: 'text' | 'rewrite' = formData.get('feature') === 'rewrite' ? 'rewrite' : 'text'
  if (!await isFeatureEnabled(feature)) {
    return NextResponse.json({ error: 'This feature is disabled.' }, { status: 403 })
  }

  const audio = formData.get('audio') as File | null
  if (!audio) return NextResponse.json({ error: 'No audio provided.' }, { status: 400 })

  const mimeType = audio.type.split(';')[0].trim().toLowerCase()
  if (!SUPPORTED_TYPES.includes(mimeType)) {
    return NextResponse.json({ error: `Unsupported audio type: ${audio.type || 'unknown'}` }, { status: 400 })
  }

  const sizeError = validateAudioSize(audio.size, maxAudioBytes)
  if (sizeError) return NextResponse.json({ error: sizeError }, { status: 400 })

  const ai = await getAiOrError()
  if (ai.error) return ai.error
  const { cfg, provider } = ai.ai

  // La dictée n'existe que via l'API OpenAI-compatible : jamais confiance au client, revérifié ici
  if (cfg.provider !== 'openai' || !cfg.voiceModel) {
    return NextResponse.json({ error: 'Voice dictation is not configured.' }, { status: 400 })
  }

  const arrayBuffer = await audio.arrayBuffer()
  const base64 = Buffer.from(arrayBuffer).toString('base64')

  logUsage({
    userId:    session.user.id,
    userEmail: session.user.email ?? 'unknown',
    feature,
    model:     cfg.voiceModel,
    charCount: Math.round(audio.size / 1024), // Ko
  })

  try {
    const text = await withAiSlot(cfg.maxConcurrentAiRequests, () => provider.complete({
      prompt: buildTranscribePrompt(),
      audio: base64,
      audioMimeType: mimeType,
      signal: req.signal,
      model: cfg.voiceModel,
    }), req.signal)

    return NextResponse.json({ text: text.trim() })
  } catch (err) {
    console.error('[dictate] transcription failed:', err)
    return NextResponse.json({ error: 'Transcription failed. The AI server did not return a result.' }, { status: 502 })
  }
}

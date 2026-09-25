import { NextRequest, NextResponse } from 'next/server'
import { getAiOrError } from '@/lib/llm'
import { buildOcrPrompt } from '@/lib/prompts'

export const maxDuration = 300
import { validateImageSize, requestTooLarge } from '@/lib/validators'
import { getDynamicLimits } from '@/lib/limits'
import { logUsage } from '@/lib/usage'
import { isFeatureEnabled } from '@/lib/features-guard'
import { requireUser } from '@/lib/user-guard'

export async function POST(req: NextRequest) {
  const guard = await requireUser({ rateLimit: true })
  if (guard.error) return guard.error
  const { session } = guard

  if (!await isFeatureEnabled('image')) {
    return NextResponse.json({ error: 'This feature is disabled.' }, { status: 403 })
  }

  // Refus avant de lire le corps : évite de charger un fichier énorme en mémoire
  const { maxImageBytes } = await getDynamicLimits()
  if (requestTooLarge(req, maxImageBytes)) {
    return NextResponse.json({ error: validateImageSize(Infinity, maxImageBytes) }, { status: 413 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data.' }, { status: 400 })
  }

  const image = formData.get('image') as File | null
  if (!image) return NextResponse.json({ error: 'No image provided.' }, { status: 400 })

  const supportedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  if (!supportedTypes.includes(image.type)) {
    return NextResponse.json({ error: `Unsupported image type: ${image.type}` }, { status: 400 })
  }

  const sizeError = validateImageSize(image.size, maxImageBytes)
  if (sizeError) return NextResponse.json({ error: sizeError }, { status: 400 })

  const arrayBuffer = await image.arrayBuffer()
  const base64 = Buffer.from(arrayBuffer).toString('base64')

  const ai = await getAiOrError()
  if (ai.error) return ai.error
  const { cfg, provider } = ai.ai

  logUsage({
    userId:    session.user.id,
    userEmail: session.user.email ?? 'unknown',
    feature:   'image',
    model:     cfg.ocrModel,
    charCount: Math.round(image.size / 1024), // Ko
  })

  const prompt = buildOcrPrompt()
  const stream = provider.stream({ prompt, images: [base64], signal: req.signal, model: cfg.ocrModel })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

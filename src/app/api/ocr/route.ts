import { NextRequest, NextResponse } from 'next/server'
import { streamOllamaResponse, getOllamaConfig } from '@/lib/ollama'
import { buildOcrPrompt } from '@/lib/prompts'

export const maxDuration = 300
import { validateImageSize } from '@/lib/validators'
import { getDynamicLimits } from '@/lib/limits'
import { logUsage } from '@/lib/usage'
import { isFeatureEnabled } from '@/lib/features-guard'
import { auth } from '@/auth'

export async function POST(req: NextRequest) {
  if (!await isFeatureEnabled('image')) {
    return NextResponse.json({ error: 'This feature is disabled.' }, { status: 403 })
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

  const { maxImageBytes } = await getDynamicLimits()
  const sizeError = validateImageSize(image.size, maxImageBytes)
  if (sizeError) return NextResponse.json({ error: sizeError }, { status: 400 })

  const arrayBuffer = await image.arrayBuffer()
  const base64 = Buffer.from(arrayBuffer).toString('base64')

  const [cfg, session] = await Promise.all([getOllamaConfig(), auth()])

  logUsage({
    userId:    session?.user?.id,
    userEmail: session?.user?.email ?? 'anonymous',
    feature:   'image',
    model:     cfg.ocrModel,
    charCount: Math.round(image.size / 1024), // Ko
  })

  const prompt = buildOcrPrompt()
  const stream = streamOllamaResponse({ prompt, images: [base64], signal: req.signal, model: cfg.ocrModel, baseUrl: cfg.baseUrl })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

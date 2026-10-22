import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/user-guard'
import { getSetting } from '@/lib/settings'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { requestTooLarge } from '@/lib/validators'
import { checkFeedbackImage, createFeedback } from '@/lib/feedback'
import {
  FEEDBACK_IMAGE_MAX_BYTES, FEEDBACK_MAX_IMAGES, FEEDBACK_PER_HOUR, FeedbackSubmitSchema, type FeedbackContext,
} from '@/lib/feedback-schema'
import pkg from '../../../../package.json'

// « Signaler un problème ou suggérer une amélioration » : un message (+ jusqu'à 5 images) déposé dans la boîte de
// réception des administrateurs. Pas d'email, pas d'appel IA.

export async function POST(req: NextRequest) {
  const guard = await requireUser()
  if (guard.error) return guard.error
  const { session } = guard

  try {
    const features = await getSetting<{ feedback?: boolean }>('features')
    if (features.feedback === false) {
      return NextResponse.json({ error: 'This feature is disabled.', code: 'disabled' }, { status: 403 })
    }
  } catch { /* base indisponible : l'insertion échouera plus bas */ }

  if (requestTooLarge(req, FEEDBACK_MAX_IMAGES * FEEDBACK_IMAGE_MAX_BYTES)) {
    return NextResponse.json({ error: 'The request is too large.', code: 'too_large' }, { status: 413 })
  }

  const rl = checkRateLimit(`feedback:${session.user.id}`, FEEDBACK_PER_HOUR, 60 * 60_000)
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec)

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data.' }, { status: 400 })
  }

  const str = (k: string) => { const v = form.get(k); return typeof v === 'string' && v !== '' ? v : undefined }
  const parsed = FeedbackSubmitSchema.safeParse({
    category:       str('category'),
    message:        str('message') ?? '',
    includeContext: form.get('includeContext') === 'true',
    tab:            str('tab'),
    uiLocale:       str('uiLocale'),
  })
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid feedback.', code: 'invalid' }, { status: 400 })
  }

  const files = form.getAll('images').filter((f): f is File => typeof f !== 'string')
  if (files.length > FEEDBACK_MAX_IMAGES) {
    return NextResponse.json({ error: 'Too many images.', code: 'too_many_images' }, { status: 400 })
  }
  const images: { mime: string; data: Buffer }[] = []
  for (const file of files) {
    const data = Buffer.from(await file.arrayBuffer())
    const check = checkFeedbackImage(data)
    if (!check.ok) {
      return NextResponse.json({ error: 'Invalid image.', code: check.error }, { status: check.error === 'too_large' ? 413 : 400 })
    }
    images.push({ mime: check.mime, data })
  }

  const { category, message, includeContext, tab, uiLocale } = parsed.data
  // La version et le navigateur sont relevés ici : seuls l'onglet et la langue viennent du formulaire
  const context: FeedbackContext | null = includeContext
    ? { tab, uiLocale, appVersion: pkg.version, userAgent: req.headers.get('user-agent')?.slice(0, 300) || undefined }
    : null

  try {
    await createFeedback({
      userId:    session.user.id,
      userEmail: session.user.email ?? 'unknown',
      category,
      message,
      context,
      images,
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[POST /api/feedback] ERROR:', err)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}

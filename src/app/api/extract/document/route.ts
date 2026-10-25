import { NextRequest, NextResponse } from 'next/server'
import { isFeatureEnabled } from '@/lib/features-guard'
import { requireUser } from '@/lib/user-guard'
import { extractDocumentBlocks } from '@/lib/document-extract'
import { validateFileExtension, validateDocumentSize, requestTooLarge, DOCUMENT_MAX_BYTES } from '@/lib/validators'

export async function POST(req: NextRequest) {
  const guard = await requireUser({ rateLimit: true })
  if (guard.error) return guard.error

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
  if (!file) return NextResponse.json({ error: 'No file provided.' }, { status: 400 })

  const sizeError = validateDocumentSize(file.size)
  if (sizeError) return NextResponse.json(sizeError, { status: 413 })

  const { ext, error: extError } = validateFileExtension(file.name)
  if (extError) return NextResponse.json(extError, { status: 400 })

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const extracted = await extractDocumentBlocks(buffer, ext, file.name, req.signal, 'extract/document')
  if (extracted.error) {
    return extracted.error instanceof Response ? extracted.error : NextResponse.json(extracted.error, { status: extracted.status })
  }

  return NextResponse.json({ blocks: extracted.blocks })
}

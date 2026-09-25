import { NextRequest, NextResponse } from 'next/server'
import { parseFile, parsePdf, isProbablyScanned, countBlockChars } from '@/lib/file-parser'
import { parsePdfWithVision } from '@/lib/pdf-vision'
import { getAiOrError } from '@/lib/llm'
import { getDynamicLimits } from '@/lib/limits'
import { isFeatureEnabled } from '@/lib/features-guard'
import { validateFileExtension } from '@/lib/validators'

export async function POST(req: NextRequest) {
  if (!await isFeatureEnabled('document')) {
    return NextResponse.json({ error: 'This feature is disabled.' }, { status: 403 })
  }
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data.' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided.' }, { status: 400 })

  const { ext, error: extError } = validateFileExtension(file.name)
  if (extError) return NextResponse.json({ error: extError }, { status: 400 })

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  let blocks
  try {
    if (ext === 'pdf') {
      blocks = await parsePdf(buffer)
      if (isProbablyScanned(blocks)) {
        const ai = await getAiOrError()
        if (ai.error) return ai.error
        blocks = await parsePdfWithVision(buffer, ai.ai.provider, ai.ai.cfg.ocrModel, req.signal)
      }
    } else {
      blocks = await parseFile(buffer, file.name)
    }
  } catch (err) {
    return NextResponse.json({ error: `File extraction failed: ${(err as Error).message}` }, { status: 422 })
  }

  const { maxDocChars } = await getDynamicLimits()
  const charCount = countBlockChars(blocks)
  if (charCount > maxDocChars) {
    return NextResponse.json({
      error: `Document exceeds the ${maxDocChars} character limit (${charCount} chars).`,
    }, { status: 400 })
  }

  return NextResponse.json({ blocks })
}

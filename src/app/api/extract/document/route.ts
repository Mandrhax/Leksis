import { NextRequest, NextResponse } from 'next/server'
import { parseFile, parsePdf, isProbablyScanned, countBlockChars } from '@/lib/file-parser'
import { parsePdfWithVision } from '@/lib/pdf-vision'
import { OLLAMA_OCR_MODEL } from '@/lib/ollama'
import { DOCUMENT_MAX_CHARS, validateFileExtension } from '@/lib/validators'

export async function POST(req: NextRequest) {
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
        blocks = await parsePdfWithVision(buffer, req.signal, OLLAMA_OCR_MODEL)
      }
    } else {
      blocks = await parseFile(buffer, file.name)
    }
  } catch (err) {
    return NextResponse.json({ error: `File extraction failed: ${(err as Error).message}` }, { status: 422 })
  }

  const charCount = countBlockChars(blocks)
  if (charCount > DOCUMENT_MAX_CHARS) {
    return NextResponse.json({
      error: `Document exceeds the ${DOCUMENT_MAX_CHARS} character limit (${charCount} chars).`,
    }, { status: 400 })
  }

  return NextResponse.json({ blocks })
}

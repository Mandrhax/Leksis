import { NextRequest, NextResponse } from 'next/server'
import { readFile }                  from 'node:fs/promises'
import { join, basename }            from 'node:path'

const CONTENT_TYPES: Record<string, string> = {
  png:  'image/png',
  jpg:  'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  svg:  'image/svg+xml',
  ico:  'image/x-icon',
  gif:  'image/gif',
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params

  // Sanitiser : refuser tout ce qui ressemble à une traversée de chemin
  const safe = basename(filename)
  if (!safe || safe !== filename || safe.startsWith('.')) {
    return new NextResponse('Not found', { status: 404 })
  }

  const uploadsDir = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads')
  const filePath   = join(uploadsDir, safe)

  try {
    const buffer = await readFile(filePath)
    const ext    = safe.split('.').pop()?.toLowerCase() ?? ''
    const type   = CONTENT_TYPES[ext] ?? 'application/octet-stream'

    return new NextResponse(buffer, {
      headers: {
        'Content-Type':  type,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch {
    return new NextResponse('Not found', { status: 404 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/lib/user-guard'
import { requestTooLarge } from '@/lib/validators'
import { blocksToDocx } from '@/lib/docx-export'

const MAX_BODY_BYTES = 5 * 1024 * 1024
const MAX_BLOCKS     = 20_000

const BlockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('paragraph'), text: z.string() }),
  z.object({ type: z.literal('heading'), level: z.union([z.literal(1), z.literal(2)]), text: z.string() }),
  z.object({ type: z.literal('table'), headers: z.array(z.string()), rows: z.array(z.array(z.string())) }),
  z.object({ type: z.literal('page-break') }),
])

const BodySchema = z.object({
  blocks:   z.array(BlockSchema).min(1).max(MAX_BLOCKS),
  filename: z.string().min(1).max(200),
})

/** Nom de fichier sûr pour Content-Disposition : pas de séparateurs, guillemets ni caractères de contrôle. */
function safeFilename(name: string): string {
  const cleaned = name.replace(/[\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120)
  const base = cleaned && cleaned !== '.docx' ? cleaned : 'document'
  return /\.docx$/i.test(base) ? base : `${base}.docx`
}

/** Content-Disposition avec repli ASCII + nom UTF-8 (RFC 5987) pour les accents. */
function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_')
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

export async function POST(req: NextRequest) {
  const guard = await requireUser()
  if (guard.error) return guard.error

  if (requestTooLarge(req, MAX_BODY_BYTES)) {
    return NextResponse.json({ error: 'Request too large.' }, { status: 413 })
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  const parsed = BodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'blocks must be a non-empty array and filename is required.' }, { status: 400 })
  }
  const { blocks } = parsed.data
  const filename = safeFilename(parsed.data.filename)

  const buffer = await blocksToDocx(blocks)

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': contentDisposition(filename),
    },
  })
}

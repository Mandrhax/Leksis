import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-guard'
import { getAttachment } from '@/lib/feedback'

// Image jointe à un retour : administrateurs seulement. Le type vient des octets magiques vérifiés à l'envoi ;
// sandbox + nosniff au cas où le fichier serait ouvert directement.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession()
  if (!session) return new NextResponse('Not found', { status: 404 })
  const { id } = await params
  try {
    const att = await getAttachment(id)
    if (!att) return new NextResponse('Not found', { status: 404 })
    return new NextResponse(new Uint8Array(att.data), {
      headers: {
        'Content-Type':            att.mime,
        'Content-Length':          String(att.data.length),
        'Cache-Control':           'private, max-age=3600',
        'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; sandbox",
        'X-Content-Type-Options':  'nosniff',
      },
    })
  } catch (err) {
    console.error('[GET /api/admin/feedback/attachments/:id] ERROR:', err)
    return new NextResponse('Internal server error', { status: 500 })
  }
}

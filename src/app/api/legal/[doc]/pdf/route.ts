import { NextRequest, NextResponse } from 'next/server'
import { loadLegalContext } from '@/lib/legal'
import { buildPrivacyPolicy, buildUsagePolicy, LEGAL_TEMPLATE_VERSION } from '@/lib/legal-content'
import { generateLegalPdf } from '@/lib/legal-pdf'
import type { UILocale } from '@/lib/i18n'

// Public, comme /legal/* (exclu de proxy.ts) : la configuration est relue à chaque requête.
export const dynamic = 'force-dynamic'

const DOCS = { privacy: buildPrivacyPolicy, usage: buildUsagePolicy } as const
type DocId = keyof typeof DOCS

const LOCALES: UILocale[] = ['en', 'de', 'fr', 'it']

function isDocId(v: string): v is DocId {
  return v in DOCS
}

function isLocale(v: string): v is UILocale {
  return (LOCALES as string[]).includes(v)
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params
  if (!isDocId(doc)) return new NextResponse('Not found', { status: 404 })

  const langParam = req.nextUrl.searchParams.get('lang') ?? 'en'
  const locale = isLocale(langParam) ? langParam : 'en'

  try {
    const ctx = await loadLegalContext()
    const content = DOCS[doc](ctx, locale)
    const bytes = await generateLegalPdf(content, { siteName: ctx.siteName, version: LEGAL_TEMPLATE_VERSION, locale })
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${doc}-policy-${locale}.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('legal pdf generation failed', err)
    return new NextResponse('Internal error', { status: 500 })
  }
}

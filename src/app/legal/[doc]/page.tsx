import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { LegalDocumentView } from '@/components/ui/LegalDocumentView'
import { loadLegalContext } from '@/lib/legal'
import { buildPrivacyPolicy, buildUsagePolicy, LEGAL_TEMPLATE_VERSION } from '@/lib/legal-content'

// Page publique (le proxy l'exclut) : la configuration est relue à chaque requête, la partie factuelle doit rester vraie
export const dynamic = 'force-dynamic'

const DOCS = { privacy: buildPrivacyPolicy, usage: buildUsagePolicy } as const
type DocId = keyof typeof DOCS

function isDocId(v: string): v is DocId {
  return v in DOCS
}

export async function generateMetadata({ params }: { params: Promise<{ doc: string }> }): Promise<Metadata> {
  const { doc } = await params
  return { title: isDocId(doc) ? (doc === 'privacy' ? 'Privacy policy' : 'Usage policy') : 'Not found' }
}

export default async function LegalPage({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params
  if (!isDocId(doc)) notFound()

  const ctx = await loadLegalContext()
  return (
    <LegalDocumentView
      siteName={ctx.siteName}
      doc={doc}
      content={DOCS[doc](ctx)}
      version={LEGAL_TEMPLATE_VERSION}
    />
  )
}

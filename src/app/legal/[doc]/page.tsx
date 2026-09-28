import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { LegalDocumentView } from '@/components/ui/LegalDocumentView'
import { loadLegalContext } from '@/lib/legal'
import { buildPrivacyPolicy, buildUsagePolicy, LEGAL_TEMPLATE_VERSION, type LegalDocument } from '@/lib/legal-content'
import type { UILocale } from '@/lib/i18n'

// Page publique (le proxy l'exclut) : la configuration est relue à chaque requête, la partie factuelle doit rester vraie
export const dynamic = 'force-dynamic'

const DOCS = { privacy: buildPrivacyPolicy, usage: buildUsagePolicy } as const
type DocId = keyof typeof DOCS

const LOCALES: UILocale[] = ['en', 'de', 'fr', 'it']

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
  // Les 4 langues sont générées côté serveur (texte pur, pas d'I/O) ; le composant client bascule
  // instantanément sur celle du sélecteur de langue, sans recharger la page.
  const content = Object.fromEntries(LOCALES.map(l => [l, DOCS[doc](ctx, l)])) as Record<UILocale, LegalDocument>

  return (
    <LegalDocumentView
      siteName={ctx.siteName}
      doc={doc}
      content={content}
      version={LEGAL_TEMPLATE_VERSION}
    />
  )
}

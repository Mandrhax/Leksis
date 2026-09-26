'use client'

import Link from 'next/link'
import { I18nProvider, useI18n } from '@/lib/i18n'
import { UILanguageSwitcher } from '@/components/ui/UILanguageSwitcher'
import type { LegalDocument } from '@/lib/legal-content'

interface Props {
  siteName: string
  doc:      'privacy' | 'usage'
  content:  LegalDocument
  version:  string
}

export function LegalDocumentView(props: Props) {
  return (
    <I18nProvider>
      <LegalDocumentBody {...props} />
    </I18nProvider>
  )
}

function LegalDocumentBody({ siteName, doc, content, version }: Props) {
  const { t } = useI18n()
  const other = doc === 'privacy'
    ? { href: '/legal/usage',   label: t.legal.usageLink }
    : { href: '/legal/privacy', label: t.legal.privacyLink }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-outline-variant/10 px-4 md:px-8 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-on-surface transition-colors">
          <span className="material-symbols-outlined text-base leading-none" aria-hidden="true">arrow_back</span>
          {t.legal.back}
        </Link>
        <UILanguageSwitcher />
      </header>

      <main className="max-w-3xl mx-auto px-4 md:px-8 py-10">
        <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">{siteName}</p>
        <h1 className="font-headline text-3xl font-bold text-on-surface tracking-tight mt-1">{content.title}</h1>
        <p className="text-sm text-on-surface-variant mt-3">{content.intro}</p>

        <div className="mt-8 flex flex-col gap-4">
          {content.sections.map(section => (
            <section
              key={section.id}
              id={section.id}
              className={`rounded-xl border p-6 ${
                section.warning
                  ? 'bg-error/5 border-error/40'
                  : 'bg-surface-container-lowest border-outline-variant/20'
              }`}
            >
              <h2 className="font-headline text-lg font-semibold text-on-surface flex items-center gap-2">
                {section.warning && (
                  <span className="material-symbols-outlined text-error text-xl leading-none" aria-hidden="true">warning</span>
                )}
                {section.title}
              </h2>
              {section.paragraphs?.map((p, i) => (
                <p key={i} className="text-sm text-on-surface mt-3 leading-relaxed">{p}</p>
              ))}
              {section.items && (
                <ul className="mt-3 space-y-2 list-disc pl-5 text-sm text-on-surface leading-relaxed">
                  {section.items.map((item, i) => <li key={i}>{item}</li>)}
                </ul>
              )}
            </section>
          ))}
        </div>

        <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 text-xs text-on-surface-variant">
          <span>{t.legal.version.replace('{0}', version)}</span>
          <Link href={other.href} className="hover:text-on-surface transition-colors underline underline-offset-2">
            {other.label}
          </Link>
        </footer>
      </main>
    </div>
  )
}

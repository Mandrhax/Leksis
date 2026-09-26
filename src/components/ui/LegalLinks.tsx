'use client'

import Link from 'next/link'
import { useI18n } from '@/lib/i18n'

/** Liens vers les pages /legal/* : footer de l'espace de travail et page de connexion (doit être sous un I18nProvider). */
export function LegalLinks({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  const { t } = useI18n()
  return (
    <>
      <Link href="/legal/privacy" className={className} style={style}>{t.legal.privacyLink}</Link>
      <Link href="/legal/usage"   className={className} style={style}>{t.legal.usageLink}</Link>
    </>
  )
}

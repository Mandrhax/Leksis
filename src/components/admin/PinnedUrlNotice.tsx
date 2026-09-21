'use client'

import { useI18n } from '@/lib/i18n'

/**
 * Avertit quand NEXTAUTH_URL est figée dans la configuration du serveur : Auth.js force alors
 * chaque redirection vers cette adresse, ce qui annule la détection automatique.
 */
export function PinnedUrlNotice({ url }: { url: string }) {
  const { t } = useI18n()
  if (!url) return null
  return (
    <div className="flex items-start gap-3 rounded-xl border border-[rgba(230,126,34,0.3)] bg-[rgba(230,126,34,0.06)] px-5 py-3 mb-6">
      <span className="material-symbols-outlined text-[1.1rem] leading-none mt-0.5 text-[#e67e22]" aria-hidden="true">warning</span>
      <p className="text-sm text-on-surface leading-relaxed">{t.caddyForm.pinnedWarning.replace('{0}', url)}</p>
    </div>
  )
}

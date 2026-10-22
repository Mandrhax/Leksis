'use client'

import { useI18n } from '@/lib/i18n'
import type { FeedbackCategory } from '@/lib/feedback-schema'

/**
 * Lien discret sous un résultat : ouvre « Signaler un problème » avec la catégorie déjà choisie.
 * Le résultat n'est jamais joint automatiquement : l'utilisateur le colle lui-même s'il le souhaite.
 */
export function ReportResultLink({ category, onReport }: { category: FeedbackCategory; onReport: (c: FeedbackCategory) => void }) {
  const { t } = useI18n()
  const label = category === 'translation' ? t.feedback.reportTranslation : t.feedback.reportResult
  return (
    <button
      type="button"
      onClick={() => onReport(category)}
      className="text-button text-xs hover:text-on-surface transition-colors"
    >
      <span className="material-symbols-outlined text-sm leading-none" aria-hidden="true">flag</span>
      <span>{label}</span>
    </button>
  )
}

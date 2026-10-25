'use client'

import { useI18n } from '@/lib/i18n'
import { hasFormalAddress } from '@/lib/register-detect'
import type { Formality } from '@/types/leksis'

/**
 * Tutoiement / vouvoiement d'une traduction de document ou d'image : « comme l'original » (null, par défaut),
 * tu ou vous. Affiché seulement si la langue cible fait la distinction (pas vers l'anglais).
 */
export function AddressChoice({ value, onChange, targetCode }: {
  value: Formality | null
  onChange: (v: Formality | null) => void
  targetCode: string
}) {
  const { t } = useI18n()
  if (!hasFormalAddress(targetCode)) return null
  const options: { v: Formality | null; label: string }[] = [
    { v: null,       label: t.docTab.formalityKeep },
    { v: 'Informal', label: t.textTab.informal },
    { v: 'Formal',   label: t.textTab.formal },
  ]
  return (
    <div className="flex items-center gap-2" role="group" aria-label={t.textTab.formality}>
      <span className="text-xs font-bold text-on-surface tracking-wider">{t.textTab.formality}</span>
      <div className="boundaries">
        {options.map(o => (
          <button
            key={o.v ?? 'keep'}
            type="button"
            aria-pressed={value === o.v}
            onClick={() => onChange(o.v)}
            className={`formal-btn ${value === o.v ? 'active' : ''}`}
          >{o.label}</button>
        ))}
      </div>
    </div>
  )
}

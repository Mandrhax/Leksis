'use client'

export interface ServiceTab<T extends string> {
  id:   T
  label: string
  icon:  string
}

interface Props<T extends string> {
  tabs:     ServiceTab<T>[]
  active:   T
  onChange: (id: T) => void
  ariaLabel: string
}

/** Underlined tab bar shared by the admin service pages (AI / DB / Caddy). */
export function ServiceTabBar<T extends string>({ tabs, active, onChange, ariaLabel }: Props<T>) {
  return (
    <div className="flex gap-2 sm:gap-6 border-b border-outline-variant/20 mb-6" role="tablist" aria-label={ariaLabel}>
      {tabs.map(tb => (
        <button
          key={tb.id}
          role="tab"
          type="button"
          aria-selected={active === tb.id}
          onClick={() => onChange(tb.id)}
          className={`tab-btn py-3 px-2 text-sm font-medium border-b-2 transition-all ${
            active === tb.id
              ? 'text-on-surface border-primary'
              : 'text-on-surface-variant border-transparent hover:text-on-surface'
          }`}
        >
          <span className="material-symbols-outlined align-middle mr-1.5 text-lg" aria-hidden="true">{tb.icon}</span>
          {tb.label}
        </button>
      ))}
    </div>
  )
}

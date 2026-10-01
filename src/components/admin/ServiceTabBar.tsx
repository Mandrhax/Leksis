'use client'

import { useEffect, useRef, useState } from 'react'

export interface ServiceTab<T extends string> {
  id:   T
  label: string
  icon:  string
  /** Shows a small dot on the tab — e.g. unsaved changes in that section. */
  dirty?: boolean
}

interface Props<T extends string> {
  tabs:     ServiceTab<T>[]
  active:   T
  onChange: (id: T) => void
  ariaLabel: string
  /** Tooltip/aria-label for a tab's dirty dot, when any tab sets `dirty`. */
  dirtyLabel?: string
}

/** Underlined tab bar shared by the admin service pages (AI / DB / Caddy). */
export function ServiceTabBar<T extends string>({ tabs, active, onChange, ariaLabel, dirtyLabel }: Props<T>) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [fade, setFade] = useState<{ left: boolean; right: boolean }>({ left: false, right: false })

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    function update() {
      if (!el) return
      setFade({
        left:  el.scrollLeft > 0,
        right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
      })
    }
    update()
    el.addEventListener('scroll', update)
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => { el.removeEventListener('scroll', update); ro.disconnect() }
  }, [tabs])

  return (
    <div className="relative mb-6">
      <div ref={scrollRef} className="flex gap-2 sm:gap-6 border-b border-outline-variant/20 overflow-x-auto" role="tablist" aria-label={ariaLabel}>
        {tabs.map(tb => (
          <button
            key={tb.id}
            role="tab"
            type="button"
            aria-selected={active === tb.id}
            onClick={() => onChange(tb.id)}
            className={`tab-btn py-3 px-2 text-sm font-medium border-b-2 transition-all shrink-0 whitespace-nowrap ${
              active === tb.id
                ? 'text-on-surface border-primary'
                : 'text-on-surface-variant border-transparent hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined align-middle mr-1.5 text-lg" aria-hidden="true">{tb.icon}</span>
            {tb.label}
            {tb.dirty && (
              <span
                className="inline-block w-1.5 h-1.5 rounded-full bg-primary align-middle ml-1.5"
                title={dirtyLabel}
                aria-label={dirtyLabel}
              />
            )}
          </button>
        ))}
      </div>
      {fade.left && (
        <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-surface to-transparent" aria-hidden="true" />
      )}
      {fade.right && (
        <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-surface to-transparent" aria-hidden="true" />
      )}
    </div>
  )
}

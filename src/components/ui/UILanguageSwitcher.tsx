'use client'

import { useState, useRef, useEffect, useId } from 'react'
import { createPortal } from 'react-dom'
import { useI18n, type UILocale } from '@/lib/i18n'

// ─── Flag SVGs ────────────────────────────────────────────────────────────────

function FlagGB({ size = 20 }: { size?: number }) {
  const raw = useId()
  const u   = raw.replace(/[^a-zA-Z0-9]/g, '_')
  const h   = Math.round(size * 40 / 60)
  const cp  = (s: string) => `url(#${u}${s})`
  return (
    <svg width={size} height={h} viewBox="0 0 60 40" aria-hidden="true"
         style={{ display: 'block', flexShrink: 0, borderRadius: 2 }}>
      <defs>
        <clipPath id={`${u}tl`}><rect x="0"  y="0"  width="30" height="20"/></clipPath>
        <clipPath id={`${u}tr`}><rect x="30" y="0"  width="30" height="20"/></clipPath>
        <clipPath id={`${u}bl`}><rect x="0"  y="20" width="30" height="20"/></clipPath>
        <clipPath id={`${u}br`}><rect x="30" y="20" width="30" height="20"/></clipPath>
      </defs>

      {/* Blue field */}
      <rect width="60" height="40" fill="#012169"/>

      {/* White saltire */}
      <line x1="0" y1="0" x2="60" y2="40" stroke="#fff" strokeWidth="12"/>
      <line x1="60" y1="0" x2="0" y2="40" stroke="#fff" strokeWidth="12"/>

      {/* Red saltire counterchanged — "/" diagonal */}
      <g clipPath={cp('tl')}><line x1="0" y1="0" x2="60" y2="40" stroke="#C8102E" strokeWidth="7.2" transform="translate(1.5,-2)"/></g>
      <g clipPath={cp('br')}><line x1="0" y1="0" x2="60" y2="40" stroke="#C8102E" strokeWidth="7.2" transform="translate(1.5,-2)"/></g>
      <g clipPath={cp('tr')}><line x1="0" y1="0" x2="60" y2="40" stroke="#C8102E" strokeWidth="7.2" transform="translate(-1.5,2)"/></g>
      <g clipPath={cp('bl')}><line x1="0" y1="0" x2="60" y2="40" stroke="#C8102E" strokeWidth="7.2" transform="translate(-1.5,2)"/></g>

      {/* Red saltire counterchanged — "\" diagonal */}
      <g clipPath={cp('tl')}><line x1="60" y1="0" x2="0" y2="40" stroke="#C8102E" strokeWidth="7.2" transform="translate(-1.5,-2)"/></g>
      <g clipPath={cp('br')}><line x1="60" y1="0" x2="0" y2="40" stroke="#C8102E" strokeWidth="7.2" transform="translate(-1.5,-2)"/></g>
      <g clipPath={cp('tr')}><line x1="60" y1="0" x2="0" y2="40" stroke="#C8102E" strokeWidth="7.2" transform="translate(1.5,2)"/></g>
      <g clipPath={cp('bl')}><line x1="60" y1="0" x2="0" y2="40" stroke="#C8102E" strokeWidth="7.2" transform="translate(1.5,2)"/></g>

      {/* White cross */}
      <rect x="24"   width="12"  height="40" fill="#fff"/>
      <rect y="16"   width="60"  height="8"  fill="#fff"/>

      {/* Red cross */}
      <rect x="26.4" width="7.2" height="40" fill="#C8102E"/>
      <rect y="17.6" width="60"  height="4.8" fill="#C8102E"/>
    </svg>
  )
}

function FlagDE({ size = 20 }: { size?: number }) {
  const h = Math.round(size * 3 / 5)
  return (
    <svg width={size} height={h} viewBox="0 0 5 3" aria-hidden="true"
         style={{ display: 'block', flexShrink: 0, borderRadius: 2 }}>
      <rect width="5" height="1"   fill="#000"/>
      <rect y="1"   width="5" height="1" fill="#D00"/>
      <rect y="2"   width="5" height="1" fill="#FFCE00"/>
    </svg>
  )
}

function FlagFR({ size = 20 }: { size?: number }) {
  const h = Math.round(size * 2 / 3)
  return (
    <svg width={size} height={h} viewBox="0 0 3 2" aria-hidden="true"
         style={{ display: 'block', flexShrink: 0, borderRadius: 2 }}>
      <rect width="1" height="2" fill="#002395"/>
      <rect x="1"   width="1" height="2" fill="#fff"/>
      <rect x="2"   width="1" height="2" fill="#ED2939"/>
    </svg>
  )
}

function FlagIcon({ locale, size }: { locale: UILocale; size?: number }) {
  if (locale === 'en') return <FlagGB size={size}/>
  if (locale === 'de') return <FlagDE size={size}/>
  return <FlagFR size={size}/>
}

// ─── Locale list ──────────────────────────────────────────────────────────────

const LOCALES: { code: UILocale; label: string }[] = [
  { code: 'en', label: 'EN' },
  { code: 'de', label: 'DE' },
  { code: 'fr', label: 'FR' },
]

// ─── Switcher component ───────────────────────────────────────────────────────

export function UILanguageSwitcher() {
  const { locale, setLocale, t } = useI18n()
  const [open, setOpen]          = useState(false)
  const btnRef                   = useRef<HTMLButtonElement>(null)
  const menuRef                  = useRef<HTMLDivElement>(null)
  const [pos, setPos]            = useState({ top: 0, right: 0 })

  useEffect(() => {
    if (open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 6, right: window.innerWidth - r.right })
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        btnRef.current  && !btnRef.current.contains(e.target as Node)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const dropdown = open ? createPortal(
    <div
      ref={menuRef}
      style={{ top: pos.top, right: pos.right }}
      className="fixed z-[300] min-w-[80px] bg-surface-container-lowest rounded-xl
                 border border-outline-variant/20 shadow-lg py-1 overflow-hidden"
    >
      {LOCALES.map(l => (
        <button
          key={l.code}
          type="button"
          onClick={() => { setLocale(l.code); setOpen(false) }}
          className={`w-full flex items-center gap-2.5 px-3.5 py-2.5
                      hover:bg-surface-container-low transition-colors
                      ${locale === l.code ? 'text-primary font-semibold' : 'text-on-surface'}`}
        >
          <FlagIcon locale={l.code} size={20}/>
          <span className="text-sm">{l.label}</span>
          {locale === l.code && (
            <span
              className="material-symbols-outlined text-primary leading-none ml-auto"
              style={{ fontSize: '14px', fontVariationSettings: "'FILL' 1" }}
              aria-hidden="true"
            >
              check
            </span>
          )}
        </button>
      ))}
    </div>,
    document.body
  ) : null

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(v => !v)}
        className="icon-btn flex items-center gap-0.5"
        aria-label={t.langSwitcher.ariaLabel}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <FlagIcon locale={locale} size={20}/>
        <span
          className="material-symbols-outlined text-outline leading-none"
          style={{ fontSize: '14px' }}
          aria-hidden="true"
        >
          expand_more
        </span>
      </button>
      {dropdown}
    </>
  )
}

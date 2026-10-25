'use client'

import { useState, useEffect, useRef, useCallback, useId } from 'react'
import { createPortal } from 'react-dom'
import { LANGUAGES } from '@/lib/languages'
import { useI18n } from '@/lib/i18n'
import type { Language } from '@/types/leksis'

const FAVORITES_KEY = 'leksisFavoriteLangs'

function getFavorites(): string[] {
  try { return JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]') } catch { return [] }
}
function saveFavorites(codes: string[]) {
  try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(codes)) } catch { /* ignore */ }
}

type Props = {
  value: Language | null          // null = Auto Detect
  onChange: (lang: Language) => void
  includeAutoDetect?: boolean
  variant?: 'source' | 'target'   // source = primary color, target = on-surface color
}

export function LanguageDropdown({ value, onChange, includeAutoDetect = false, variant = 'source' }: Props) {
  const { t } = useI18n()
  const [open, setOpen]           = useState(false)
  const [search, setSearch]       = useState('')
  const [favorites, setFavorites] = useState<string[]>([])
  const [dropPos, setDropPos]     = useState({ top: 0, left: 0 })
  const [active, setActive]       = useState(0)   // option mise en évidence au clavier
  const triggerRef = useRef<HTMLDivElement>(null)
  const searchRef  = useRef<HTMLInputElement>(null)
  const listRef    = useRef<HTMLUListElement>(null)
  const uid        = useId()

  useEffect(() => { setFavorites(getFavorites()) }, [])

  // Focus search on open
  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 10)
  }, [open])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      const dropdown = document.getElementById('leksis-lang-dropdown')
      if (triggerRef.current?.contains(target) || dropdown?.contains(target)) return
      setOpen(false)
      setSearch('')
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); setSearch(''); triggerRef.current?.focus() } }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  const reposition = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const dropdownHeight = 280 // approx max-h of the panel + search bar
    const dropdownWidth  = 224 // w-56
    const overflowsBottom = rect.bottom + 6 + dropdownHeight > window.innerHeight
    const top  = overflowsBottom ? Math.max(8, rect.top - dropdownHeight - 6) : rect.bottom + 6
    const left = Math.min(rect.left, window.innerWidth - dropdownWidth - 8)
    setDropPos({ top, left: Math.max(8, left) })
  }, [])

  // Recalculate position on resize/scroll while open (page may scroll under a fixed dropdown)
  useEffect(() => {
    if (!open) return
    reposition()
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [open, reposition])

  const handleOpen = () => {
    if (!open) reposition()
    setOpen(o => !o)
    if (open) setSearch('')
  }

  const toggleFavorite = useCallback((code: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setFavorites(prev => {
      const next = prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
      saveFavorites(next)
      return next
    })
  }, [])

  const handleSelect = (lang: Language) => {
    onChange(lang)
    setOpen(false)
    setSearch('')
    triggerRef.current?.focus()   // le focus revient au déclencheur (clavier, lecteur d'écran)
  }

  const AUTO: Language = { code: 'auto', name: t.langDropdown.autoDetect }

  const q = search.toLowerCase()
  const allFiltered = LANGUAGES
    .filter(l => l.name.toLowerCase().includes(q) || l.code.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name))

  const favoriteLanguages = allFiltered.filter(l => favorites.includes(l.code))
  const otherLanguages    = allFiltered.filter(l => !favorites.includes(l.code))

  // Ordre de navigation au clavier = ordre affiché
  const options: Language[] = [
    ...(includeAutoDetect && !search ? [AUTO] : []),
    ...(!search ? favoriteLanguages : []),
    ...(search ? allFiltered : otherLanguages),
  ]
  const optionId = (i: number) => `${uid}-opt-${i}`
  const indexOf = (l: Language) => options.indexOf(l)

  // Nouvelle recherche ou ouverture : la langue choisie (ou la première) est mise en évidence
  useEffect(() => {
    if (!open) return
    const current = options.findIndex(l => l.code === (value?.code ?? 'auto'))
    setActive(search || current < 0 ? 0 : current)
  }, [open, search]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open) document.getElementById(optionId(active))?.scrollIntoView({ block: 'nearest' })
  }, [active, open]) // eslint-disable-line react-hooks/exhaustive-deps

  const onSearchKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(options.length - 1, a + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)) }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0) }
    else if (e.key === 'End') { e.preventDefault(); setActive(options.length - 1) }
    else if (e.key === 'Enter') { e.preventDefault(); if (options[active]) handleSelect(options[active]) }
    else if (e.key === 'Tab') { setOpen(false); setSearch('') }
  }

  // A caller can pass a richer name for the auto-detect state (e.g. "Auto Detect · French") once
  // it knows what it detected — trust it instead of always showing the bare default.
  const displayLabel = !value ? t.langDropdown.autoDetect : value.name

  const isAutoDetect = value?.code === 'auto' || !value
  const labelCls = variant === 'source'
    ? isAutoDetect
      ? 'text-xs font-bold text-on-surface-variant tracking-wider uppercase group-hover:text-on-surface transition-colors'
      : 'text-xs font-bold text-primary tracking-wider uppercase group-hover:text-primary-dim transition-colors'
    : 'text-xs font-bold text-on-surface tracking-wider uppercase group-hover:text-primary transition-colors'

  const dropdown = open ? createPortal(
    <div
      id="leksis-lang-dropdown"
      style={{ position: 'fixed', top: dropPos.top, left: dropPos.left, zIndex: 200 }}
      className="w-56 bg-surface-container-lowest border border-outline-variant/20 rounded-xl shadow-2xl overflow-hidden"
    >
      <div className="p-2 border-b border-outline-variant/10">
        <div className="flex items-center gap-2 bg-surface-container rounded-lg px-2.5 py-1.5">
          <span className="material-symbols-outlined text-outline text-sm" aria-hidden="true">search</span>
          <input
            ref={searchRef}
            type="text"
            placeholder={t.langDropdown.searchPlaceholder}
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={onSearchKey}
            role="combobox"
            aria-expanded
            aria-controls={`${uid}-list`}
            aria-activedescendant={options[active] ? optionId(active) : undefined}
            aria-label={t.langDropdown.searchPlaceholder}
            className="bg-transparent border-none outline-none text-sm text-on-surface placeholder:text-outline w-full p-0"
            autoComplete="off"
          />
        </div>
      </div>

      <ul ref={listRef} id={`${uid}-list`} className="max-h-60 overflow-y-auto py-1" role="listbox" aria-label={t.langDropdown.listLabel}>
        {includeAutoDetect && !search && (
          <LangItem
            id={optionId(0)}
            active={active === 0}
            name={t.langDropdown.autoDetect}
            isSelected={!value || value.code === 'auto'}
            isFavorite={false}
            showStar={false}
            removeLabel=""
            addLabel=""
            onSelect={() => handleSelect(AUTO)}
            onToggleFav={() => {}}
          />
        )}

        {favoriteLanguages.length > 0 && !search && (
          <>
            <li className="px-3 py-1 text-xs font-semibold text-on-surface-variant/60 uppercase tracking-wide select-none">{t.langDropdown.favorites}</li>
            {favoriteLanguages.map(l => (
              <LangItem
                key={l.code}
                id={optionId(indexOf(l))}
                active={active === indexOf(l)}
                name={l.name}
                isSelected={value?.code === l.code}
                isFavorite
                removeLabel={t.langDropdown.removeFromFavorites}
                addLabel={t.langDropdown.addToFavorites}
                onSelect={() => handleSelect(l)}
                onToggleFav={e => toggleFavorite(l.code, e)}
              />
            ))}
            <li className="border-t border-outline-variant/10 my-1" role="separator" />
          </>
        )}

        {(search ? allFiltered : otherLanguages).map(l => (
          <LangItem
            key={l.code}
            id={optionId(indexOf(l))}
            active={active === indexOf(l)}
            name={l.name}
            isSelected={value?.code === l.code}
            isFavorite={favorites.includes(l.code)}
            removeLabel={t.langDropdown.removeFromFavorites}
            addLabel={t.langDropdown.addToFavorites}
            onSelect={() => handleSelect(l)}
            onToggleFav={e => toggleFavorite(l.code, e)}
          />
        ))}

        {allFiltered.length === 0 && (
          <li className="px-3 py-3 text-sm text-on-surface-variant/60">{t.langDropdown.noResults}</li>
        )}
      </ul>
    </div>,
    document.body
  ) : null

  return (
    <>
      <div
        ref={triggerRef}
        onClick={handleOpen}
        className="flex items-center gap-1.5 cursor-pointer group"
        role="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        tabIndex={0}
        aria-label={`${t.langDropdown.listLabel}: ${displayLabel}`}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ' || (e.key === 'ArrowDown' && !open)) { e.preventDefault(); handleOpen() }
        }}
      >
        <span className={labelCls}>{displayLabel}</span>
        <span className="material-symbols-outlined text-outline text-sm" aria-hidden="true">expand_more</span>
      </div>
      {dropdown}
    </>
  )
}

type LangItemProps = {
  id: string
  active: boolean
  name: string
  isSelected: boolean
  isFavorite: boolean
  showStar?: boolean
  removeLabel: string
  addLabel: string
  onSelect: () => void
  onToggleFav: (e: React.MouseEvent) => void
}

function LangItem({ id, active, name, isSelected, isFavorite, showStar = true, removeLabel, addLabel, onSelect, onToggleFav }: LangItemProps) {
  return (
    <li
      id={id}
      role="option"
      aria-selected={isSelected}
      onClick={onSelect}
      className={`lang-row px-3 py-1.5 cursor-pointer text-sm transition-colors hover:bg-surface-container-low ${active ? 'bg-surface-container-low' : ''} ${
        isSelected ? 'text-primary font-medium' : 'text-on-surface'
      }`}
    >
      <span>{name}</span>
      {showStar && (
        <button
          type="button"
          tabIndex={-1}
          onClick={onToggleFav}
          aria-label={isFavorite ? removeLabel : addLabel}
          className={`star-btn material-symbols-outlined text-base ${isFavorite ? 'star-active' : ''}`}
          style={{ fontVariationSettings: isFavorite ? "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 20" : "'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 24" }}
        >
          star
        </button>
      )}
    </li>
  )
}

'use client'

import { useSession, signOut } from 'next-auth/react'
import Link from 'next/link'
import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '@/lib/i18n'

export function AccountMenu() {
  const { t }                     = useI18n()
  const { data: session, status } = useSession()
  const [open, setOpen]           = useState(false)
  const btnRef                    = useRef<HTMLButtonElement>(null)
  const menuRef                   = useRef<HTMLDivElement>(null)
  const [pos, setPos]             = useState({ top: 0, right: 0 })
  const [isDark, setIsDark]       = useState(false)

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'))
  }, [])

  function toggleDark() {
    const next = !isDark
    setIsDark(next)
    document.documentElement.classList.toggle('dark', next)
    document.documentElement.classList.toggle('light', !next)
    document.body.style.backgroundColor = next ? '#0f1112' : ''
    document.body.style.color = next ? '#dde3e6' : ''
    try { localStorage.setItem('leksisDarkMode', String(next)) } catch {}
  }

  // Positionner le dropdown aligné sur le bord droit du bouton
  useEffect(() => {
    if (open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 6, right: window.innerWidth - r.right })
    }
  }, [open])

  // Fermer sur clic extérieur
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        btnRef.current  && !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  if (status === 'loading') {
    return (
      <div className="w-8 h-8 flex items-center justify-center">
        <span className="material-symbols-outlined text-lg text-on-surface-variant/40 leading-none">
          account_circle
        </span>
      </div>
    )
  }

  if (status === 'unauthenticated') return null

  const user    = session?.user
  const initial = (user?.name ?? user?.email ?? '?')[0].toUpperCase()
  const label   = user?.name ?? user?.email ?? t.account.accountLabel

  const dropdown = open ? createPortal(
    <div
      ref={menuRef}
      style={{ top: pos.top, right: pos.right }}
      className="fixed z-[300] min-w-[200px] bg-surface-container-lowest rounded-xl
                 border border-outline-variant/20 shadow-lg py-1 overflow-hidden"
    >
      {/* Infos utilisateur */}
      <div className="px-4 py-3 border-b border-outline-variant/10">
        <p className="text-xs font-semibold text-on-surface truncate">{label}</p>
        {user?.name && (
          <p className="text-xs text-on-surface-variant truncate mt-0.5">{user.email}</p>
        )}
      </div>

      {/* Administration (admin only) */}
      {user?.role === 'admin' && (
        <Link
          href="/admin/settings"
          onClick={() => setOpen(false)}
          className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-on-surface
                     hover:bg-surface-container-low transition-colors"
        >
          <span className="material-symbols-outlined text-base leading-none text-on-surface-variant" aria-hidden="true">
            admin_panel_settings
          </span>
          {t.account.admin}
        </Link>
      )}

      {/* Mode sombre / clair */}
      <button
        onClick={toggleDark}
        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-on-surface
                   hover:bg-surface-container-low transition-colors"
      >
        <span className="material-symbols-outlined text-base leading-none text-on-surface-variant" aria-hidden="true">
          {isDark ? 'light_mode' : 'dark_mode'}
        </span>
        {isDark ? t.account.lightMode : t.account.darkMode}
      </button>

      {/* Paramètres */}
      <Link
        href="/settings"
        onClick={() => setOpen(false)}
        className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-on-surface
                   hover:bg-surface-container-low transition-colors"
      >
        <span className="material-symbols-outlined text-base leading-none text-on-surface-variant" aria-hidden="true">
          settings
        </span>
        {t.account.settings}
      </Link>

      <button
        onClick={() => { setOpen(false); signOut({ callbackUrl: '/auth/signin' }) }}
        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-error
                   hover:bg-surface-container-low transition-colors"
      >
        <span className="material-symbols-outlined text-base leading-none" aria-hidden="true">
          logout
        </span>
        {t.account.signOut}
      </button>
    </div>,
    document.body
  ) : null

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen(v => !v)}
        className="icon-btn flex items-center justify-center"
        aria-label={t.account.accountLabel}
        title={label}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <div className="w-7 h-7 rounded-full bg-primary-container flex items-center justify-center">
          <span className="font-headline font-bold text-xs text-on-primary-container leading-none">
            {initial}
          </span>
        </div>
      </button>

      {dropdown}
    </>
  )
}

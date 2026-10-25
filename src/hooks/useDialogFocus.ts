'use client'

import { useEffect, type RefObject } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Fenêtre modale accessible au clavier : à l'ouverture, le focus va dans la fenêtre ; Tab et Maj+Tab y restent
 * (sinon on tabulait dans la page grisée derrière) ; à la fermeture, le focus revient à l'élément qui l'a ouverte.
 */
export function useDialogFocus(open: boolean, ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    const focusables = () => [...(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].filter(el => el.offsetParent !== null)

    const first = focusables()[0]
    ;(first ?? ref.current)?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !ref.current) return
      const items = focusables()
      if (!items.length) { e.preventDefault(); return }
      const firstEl = items[0], lastEl = items[items.length - 1]
      if (e.shiftKey && (document.activeElement === firstEl || !ref.current.contains(document.activeElement))) {
        e.preventDefault(); lastEl.focus()
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault(); firstEl.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (opener && document.contains(opener)) opener.focus()
    }
  }, [open, ref])
}

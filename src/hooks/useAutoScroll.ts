'use client'

import { useEffect, type RefObject } from 'react'

/** Fait suivre la fin du texte pendant le streaming (`active`) : le panneau de résultat défile tout seul. */
export function useAutoScroll(ref: RefObject<HTMLElement | null>, content: unknown, active: boolean): void {
  useEffect(() => {
    const el = ref.current
    if (el && active) el.scrollTop = el.scrollHeight
  }, [ref, content, active])
}

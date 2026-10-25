// Langue cible mémorisée par onglet (localStorage) — navigateur uniquement.
import { LANGUAGES } from '@/lib/languages'
import type { Language } from '@/types/leksis'

export const DEFAULT_TARGET_LANGUAGE: Language = { code: 'fr', name: 'French' }

/**
 * Langue cible mémorisée sous `key`, sinon celle réglée par l'admin (`defaultCode`), sinon le français.
 * Lit localStorage : ne jamais appeler pendant le premier rendu (le serveur n'a pas localStorage, React
 * signalerait une différence d'hydratation) — dans un useEffect.
 */
export function loadStoredLanguage(key: string, defaultCode?: string): Language {
  try {
    const r = localStorage.getItem(key)
    if (r) return JSON.parse(r)
    if (defaultCode && defaultCode !== 'auto') {
      const found = LANGUAGES.find(l => l.code === defaultCode)
      if (found) return found
    }
  } catch { /* ignore */ }
  return DEFAULT_TARGET_LANGUAGE
}

export function saveStoredLanguage(key: string, lang: Language): void {
  try { localStorage.setItem(key, JSON.stringify(lang)) } catch { /* ignore */ }
}

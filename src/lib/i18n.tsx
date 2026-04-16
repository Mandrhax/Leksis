'use client'

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { messages as en } from '@/locales/en'
import { messages as de } from '@/locales/de'
import { messages as fr } from '@/locales/fr'
import { messages as it } from '@/locales/it'
import type { Messages } from '@/locales/en'

export type UILocale = 'en' | 'de' | 'fr' | 'it'

const LOCALE_KEY = 'leksisUILocale'
const LOCALE_MAP: Record<UILocale, Messages> = { en, de, fr, it }

type I18nContextValue = {
  locale:    UILocale
  t:         Messages
  setLocale: (l: UILocale) => void
}

const I18nContext = createContext<I18nContextValue>({
  locale:    'en',
  t:         en,
  setLocale: () => {},
})

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<UILocale>('en')

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LOCALE_KEY) as UILocale | null
      if (stored && stored in LOCALE_MAP) {
        setLocaleState(stored)
      } else {
        const browserLang = navigator.language.split('-')[0] as UILocale
        if (browserLang in LOCALE_MAP) setLocaleState(browserLang)
      }
    } catch { /* ignore */ }
  }, [])

  function setLocale(l: UILocale) {
    setLocaleState(l)
    try { localStorage.setItem(LOCALE_KEY, l) } catch { /* ignore */ }
  }

  return (
    <I18nContext.Provider value={{ locale, t: LOCALE_MAP[locale], setLocale }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n() {
  return useContext(I18nContext)
}

'use client'

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import type { Messages } from '@/locales/en'
import { LOCALE_COOKIE, isUILocale, type UILocale } from '@/lib/ui-locale'

export type { UILocale } from '@/lib/ui-locale'

// La langue du premier rendu est choisie par le serveur (cookie, sinon Accept-Language — root layout) qui envoie
// SES textes seulement (I18nBootstrap) : plus de flash d'anglais au chargement, et le navigateur ne télécharge
// plus les 4 langues (~190 Ko de JS). Une autre langue n'est chargée qu'au moment où l'utilisateur la choisit.

const LOCALE_KEY = LOCALE_COOKIE

/** Textes d'une langue, chargés à la demande (un fichier JS par langue). */
function loadMessages(l: UILocale): Promise<Messages> {
  switch (l) {
    case 'de': return import('@/locales/de').then(m => m.messages)
    case 'fr': return import('@/locales/fr').then(m => m.messages)
    case 'it': return import('@/locales/it').then(m => m.messages)
    default:   return import('@/locales/en').then(m => m.messages)
  }
}

type Bootstrap = { locale: UILocale; messages: Messages }
const BootstrapContext = createContext<Bootstrap | null>(null)

/** Posé par le root layout (serveur) : langue et textes du premier rendu. */
export function I18nBootstrap({ locale, messages, children }: Bootstrap & { children: ReactNode }) {
  return <BootstrapContext.Provider value={{ locale, messages }}>{children}</BootstrapContext.Provider>
}

type I18nContextValue = {
  locale:    UILocale
  t:         Messages
  setLocale: (l: UILocale) => void
}

const I18nContext = createContext<I18nContextValue | null>(null)

function rememberLocale(l: UILocale) {
  try { localStorage.setItem(LOCALE_KEY, l) } catch { /* ignore */ }
  document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; SameSite=Lax`
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const boot = useContext(BootstrapContext)
  if (!boot) throw new Error('I18nProvider must be rendered under I18nBootstrap (root layout)')
  const [state, setState] = useState<Bootstrap>(boot)

  function setLocale(l: UILocale) {
    rememberLocale(l)
    loadMessages(l).then(messages => setState({ locale: l, messages })).catch(() => { /* réseau : on garde la langue actuelle */ })
  }

  // Choix fait avant que le serveur ne lise le cookie (versions précédentes : localStorage seulement) : repris
  // une fois, puis le cookie suffit
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LOCALE_KEY)
      if (isUILocale(stored) && stored !== boot.locale && !document.cookie.includes(`${LOCALE_COOKIE}=`)) setLocale(stored)
    } catch { /* ignore */ }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { document.documentElement.lang = state.locale }, [state.locale])

  return (
    <I18nContext.Provider value={{ locale: state.locale, t: state.messages, setLocale }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext)
  if (!value) throw new Error('useI18n must be used under an I18nProvider')
  return value
}

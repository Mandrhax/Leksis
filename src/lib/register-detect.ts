// Client-safe et pur : tutoiement ou vouvoiement (« registre ») d'un texte, et langues où ce choix existe.
//
// Le sélecteur tu/vous de l'onglet Texte sert dès que la langue CIBLE distingue les deux formes. Quand la source le
// dit (« tu » / « vous », « du » / « Sie »…), il se règle tout seul ; sinon (source anglaise, aucun pronom) c'est le
// réglage par défaut de l'admin. Heuristique volontairement simple : quelques pronoms et possessifs par langue.
//
// Les formes de politesse ont souvent un autre sens (« vous » = pluriel, « Sie » = elle/ils, « Lei » = elle) : une
// marque de tutoiement l'emporte donc toujours, et une forme polie n'est comptée que là où elle est sans ambiguïté
// (majuscule en milieu de phrase pour l'allemand et l'italien).

import type { Formality } from '@/types/leksis'

/** Langues de base qui distinguent tutoiement et vouvoiement (sélecteur actif quand la cible en fait partie) */
const T_V_LANGUAGES = new Set([
  'fr', 'de', 'it', 'es', 'pt', 'nl', 'ca', 'ro', 'cs', 'sk', 'pl', 'ru', 'uk', 'el', 'tr', 'hu', 'fi', 'sv', 'da', 'nb',
])

export function hasFormalAddress(langCode: string | null | undefined): boolean {
  if (!langCode) return false
  return T_V_LANGUAGES.has(langCode.toLowerCase().split('-')[0])
}

interface Markers {
  /** Insensibles à la casse */
  informal: RegExp
  /** Formes polies sans ambiguïté, insensibles à la casse */
  formal?: RegExp
  /** Formes polies reconnues seulement avec une majuscule en milieu de phrase */
  formalCapitalized?: string[]
}

const MARKERS: Record<string, Markers> = {
  fr: {
    // Pas « ton » : c'est aussi un nom (« le ton »). « t' » est suivi d'une lettre (« t'aime »)
    informal: /(^|[^\p{L}])((tu|te|toi|ta|tes)(?=$|[^\p{L}])|t['’](?=\p{L}))/iu,
    // « vous » est aussi le pluriel : retenu seulement sans aucune marque de tutoiement
    formal: /(^|[^\p{L}])(vous|votre|vos)(?=$|[^\p{L}])/iu,
  },
  de: {
    informal: /(^|[^\p{L}])(du|dich|dir|dein|deine|deinen|deinem|deiner|deines|euch|euer|eure)(?=$|[^\p{L}])/iu,
    formalCapitalized: ['Sie', 'Ihnen', 'Ihr', 'Ihre', 'Ihren', 'Ihrem', 'Ihrer', 'Ihres'],
  },
  it: {
    // Pas « voi » (aussi pluriel de politesse), ni « La » / « Le » (noms propres : « La Spezia »)
    informal: /(^|[^\p{L}])(tu|ti|te|tuo|tua|tuoi|tue)(?=$|[^\p{L}])/iu,
    formalCapitalized: ['Lei', 'Suo', 'Sua', 'Suoi', 'Sue'],
  },
  es: {
    informal: /(^|[^\p{L}])(tú|te|ti|tu|tus|contigo|vosotros|vosotras|os)(?=$|[^\p{L}])/iu,
    formal: /(^|[^\p{L}])(usted|ustedes)(?=$|[^\p{L}])/iu,
  },
  nl: {
    informal: /(^|[^\p{L}])(jij|je|jou|jouw|jullie)(?=$|[^\p{L}])/iu,
    formal: /(^|[^\p{L}])(u|uw)(?=$|[^\p{L}])/iu,
  },
  pt: {
    informal: /(^|[^\p{L}])(tu|te|ti|teu|tua|teus|tuas|contigo)(?=$|[^\p{L}])/iu,
    formal: /(^|[^\p{L}])(o senhor|a senhora|os senhores|as senhoras)(?=$|[^\p{L}])/iu,
  },
}

/** Mot en majuscule précédé d'un mot (pas en début de phrase, de ligne ou de citation) */
function hasCapitalizedMidSentence(text: string, words: string[]): boolean {
  const re = new RegExp(`(\\p{L}[,;]?\\s+)(${words.join('|')})(?=$|[^\\p{L}])`, 'gu')
  return re.test(text)
}

/**
 * Registre du texte source, ou null s'il ne se lit pas (langue non couverte, pas de pronom de 2ᵉ personne).
 * `sourceCode` : code BCP 47 de la source (choisie ou détectée) ; `auto` / vide = inconnu.
 */
export function detectRegister(text: string, sourceCode: string | null | undefined): Formality | null {
  if (!sourceCode || sourceCode === 'auto') return null
  const m = MARKERS[sourceCode.toLowerCase().split('-')[0]]
  if (!m) return null
  if (m.informal.test(text)) return 'Informal'
  if (m.formal?.test(text)) return 'Formal'
  if (m.formalCapitalized && hasCapitalizedMidSentence(text, m.formalCapitalized)) return 'Formal'
  return null
}

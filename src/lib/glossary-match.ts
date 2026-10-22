import type { GlossaryEntry } from '@/types/leksis'

// Logique pure du glossaire (sans base de données) : testable telle quelle.

/** Nombre maximal de termes injectés dans un prompt : borne la taille du prompt. */
export const MAX_PROMPT_TERMS = 100

/** Lettres ajoutées en fin de mot qu'une entrée « variantes » accepte (contrat → contrats, parle → parlent). */
const VARIANT_SUFFIX_MAX = 4

// Ces écritures n'ont pas de séparateur de mots : on y cherche une simple inclusion.
const UNSPACED_SCRIPTS = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}]/u

/** Minuscules, sans accents : « Résumé » et « resume » se valent. */
function fold(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function matchFolded(entry: Pick<GlossaryEntry, 'source' | 'matchVariants'>, folded: string, plain: string): boolean {
  const term = entry.source.trim()
  if (!term) return false

  if (UNSPACED_SCRIPTS.test(term)) return plain.includes(term.normalize('NFC').toLowerCase())

  const pattern = fold(term).split(/\s+/).map(escapeRegExp).join('\\s+')
  const tail = entry.matchVariants ? `\\p{L}{0,${VARIANT_SUFFIX_MAX}}` : ''
  return new RegExp(`(?<![\\p{L}\\p{N}])${pattern}${tail}(?![\\p{L}\\p{N}])`, 'u').test(folded)
}

/** Le terme apparaît-il dans le texte ? Mot entier, sans tenir compte de la casse ni des accents. */
export function termMatches(entry: Pick<GlossaryEntry, 'source' | 'matchVariants'>, text: string): boolean {
  return matchFolded(entry, fold(text), text.normalize('NFC').toLowerCase())
}

/** Termes présents dans le texte, les plus longs d'abord (« machine learning » avant « machine »), plafonnés. */
export function filterRelevantTerms(terms: GlossaryEntry[], text: string): GlossaryEntry[] {
  const folded = fold(text)
  const plain = text.normalize('NFC').toLowerCase()
  return terms
    .filter(t => matchFolded(t, folded, plain))
    .sort((a, b) => b.source.length - a.source.length)
    .slice(0, MAX_PROMPT_TERMS)
}

/**
 * Une entrée limitée à une langue s'applique aussi à ses variantes régionales :
 * « fr » vaut pour fr-CH, fr-BE… (l'inverse est faux : une entrée fr-CH ne vaut pas pour « fr »).
 */
export function langMatches(entryLang: string | null, requested: string): boolean {
  if (!entryLang) return true
  if (!requested || requested === 'auto') return true
  return entryLang === requested || entryLang === requested.split('-')[0]
}

// ---------------------------------------------------------------------------
// Prompt clause builders (used in API routes)
// ---------------------------------------------------------------------------

export function buildTranslationGlossaryClause(terms: GlossaryEntry[]): string {
  if (!terms.length) return ''
  const lines = terms.map(({ source, target }) => `- ${source} → ${target}`).join('\n')
  return `Glossary — you MUST use these exact translations for the listed terms:\n${lines}\n`
}

export function buildRewriteGlossaryClause(terms: GlossaryEntry[]): string {
  if (!terms.length) return ''
  const lines = terms.map(({ source, target }) => `- ${source} → ${target}`).join('\n')
  return `Terminology — preserve these terms exactly as listed:\n${lines}\n`
}

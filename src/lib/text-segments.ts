// Client-safe et pur : découpe un texte en paragraphes (séparés par au moins une ligne vide) pour la traduction
// incrémentale. Les séparateurs d'origine sont gardés : le texte traduit est réassemblé avec la même mise en page.

export interface Paragraphs {
  /** Paragraphes non vides, sans espaces en tête ni en fin */
  parts: string[]
  /** `separators[i]` sépare `parts[i]` de `parts[i + 1]` (toujours `parts.length - 1` éléments) */
  separators: string[]
}

// Ligne vide = fin de ligne, éventuels espaces, fin de ligne ; tout ce qui suit d'espaces ou de lignes vides en fait partie
const PARAGRAPH_BREAK = /\r?\n[ \t]*\r?\n\s*/g

export function splitParagraphs(text: string): Paragraphs {
  const body = text.trim()
  if (!body) return { parts: [], separators: [] }
  const parts: string[] = []
  const separators: string[] = []
  let last = 0
  for (const m of body.matchAll(PARAGRAPH_BREAK)) {
    parts.push(body.slice(last, m.index).trim())
    separators.push(m[0])
    last = m.index + m[0].length
  }
  parts.push(body.slice(last).trim())
  return { parts, separators }
}

/** Réassemble des paragraphes (traduits) avec les séparateurs d'origine */
export function joinParagraphs(parts: string[], separators: string[]): string {
  return parts.reduce((acc, part, i) => (i === 0 ? part : acc + (separators[i - 1] ?? '\n\n') + part), '')
}

// Port de Leksis_old/assets/js/glossary.js (logique métier uniquement, sans UI)
import type { GlossaryEntry } from '@/types/leksis'

const STORAGE_KEY = 'leksisGlossary'

export function getGlossary(): GlossaryEntry[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}

export function saveGlossary(terms: GlossaryEntry[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(terms))
  } catch { /* ignore */ }
}

function filterRelevantTerms(terms: GlossaryEntry[], text: string): GlossaryEntry[] {
  const lower = text.toLowerCase()
  return terms.filter(({ source }) => source && lower.includes(source.toLowerCase()))
}

export function buildTranslationGlossaryClause(terms: GlossaryEntry[], sourceText: string): string {
  const relevant = filterRelevantTerms(terms, sourceText)
  if (!relevant.length) return ''
  const lines = relevant.map(({ source, target }) => `- ${source} → ${target}`).join('\n')
  return `Glossary — you MUST use these exact translations for the listed terms:\n${lines}\n`
}

export function buildRewriteGlossaryClause(terms: GlossaryEntry[], sourceText: string): string {
  const relevant = filterRelevantTerms(terms, sourceText)
  if (!relevant.length) return ''
  const lines = relevant.map(({ source, target }) => `- ${source} → ${target}`).join('\n')
  return `Terminology — preserve these terms exactly as listed:\n${lines}\n`
}

export function parseCSV(text: string): GlossaryEntry[] {
  const lines = text.trim().split(/\r?\n/)
  const entries: GlossaryEntry[] = []
  for (const line of lines) {
    const cols = line.split(',').map(c => c.replace(/^"|"$/g, '').trim())
    if (cols.length >= 2 && cols[0] && cols[1]) {
      if (cols[0].toLowerCase() === 'source') continue // skip header
      entries.push({ source: cols[0], target: cols[1] })
    }
  }
  return entries
}

export function exportCSV(terms: GlossaryEntry[]): string {
  const escape = (s: string) => `"${s.replace(/"/g, '""')}"`
  return ['source,target', ...terms.map(t => `${escape(t.source)},${escape(t.target)}`)].join('\n')
}

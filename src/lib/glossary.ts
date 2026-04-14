import 'server-only'
import type { GlossaryEntry } from '@/types/leksis'
import { query } from '@/lib/db'

// ---------------------------------------------------------------------------
// Server-side DB fetch
// ---------------------------------------------------------------------------

/**
 * Fetch glossary entries relevant to a translation/rewrite operation.
 *
 * - Respects user per-glossary preferences (absent row = enabled).
 * - For translation: filters entries by language pair (source_lang / target_lang).
 *   NULL lang = matches any language.
 * - For rewrite (nullLangOnly = true): only fetches "any → any" entries
 *   (both source_lang and target_lang are NULL) — these are typically
 *   brand names / product names that must be preserved regardless of language.
 * - Then filters to only entries whose source_term appears in sourceText.
 */
export async function fetchGlossaryEntries(
  userId: string | undefined,
  sourceLang: string,
  targetLang: string,
  sourceText: string,
  nullLangOnly = false,
): Promise<GlossaryEntry[]> {
  try {
    // Build query: join glossaries + entries, exclude user-disabled glossaries
    const langFilter = nullLangOnly
      ? 'AND ge.source_lang IS NULL AND ge.target_lang IS NULL'
      : 'AND (ge.source_lang IS NULL OR ge.source_lang = $2) AND (ge.target_lang IS NULL OR ge.target_lang = $3)'

    const sql = userId
      ? `
        SELECT ge.id, ge.glossary_id, ge.source_term, ge.target_term,
               ge.source_lang, ge.target_lang
        FROM glossary_entries ge
        JOIN glossaries g ON g.id = ge.glossary_id
        WHERE NOT EXISTS (
          SELECT 1 FROM user_glossary_prefs ugp
          WHERE ugp.user_id = $1
            AND ugp.glossary_id = ge.glossary_id
            AND ugp.enabled = FALSE
        )
          ${langFilter}
      `
      : `
        SELECT ge.id, ge.glossary_id, ge.source_term, ge.target_term,
               ge.source_lang, ge.target_lang
        FROM glossary_entries ge
        JOIN glossaries g ON g.id = ge.glossary_id
        WHERE TRUE
          ${nullLangOnly
            ? 'AND ge.source_lang IS NULL AND ge.target_lang IS NULL'
            : 'AND (ge.source_lang IS NULL OR ge.source_lang = $1) AND (ge.target_lang IS NULL OR ge.target_lang = $2)'
          }
      `

    const params = userId
      ? nullLangOnly ? [userId] : [userId, sourceLang, targetLang]
      : nullLangOnly ? [] : [sourceLang, targetLang]

    const result = await query(sql, params)

    const entries: GlossaryEntry[] = result.rows.map((r: Record<string, unknown>) => ({
      id: r.id as number,
      glossaryId: r.glossary_id as number,
      source: r.source_term as string,
      target: r.target_term as string,
      sourceLang: (r.source_lang as string | null) ?? null,
      targetLang: (r.target_lang as string | null) ?? null,
    }))

    return filterRelevantTerms(entries, sourceText)
  } catch {
    // Never break a translation because of glossary errors
    return []
  }
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

function filterRelevantTerms(terms: GlossaryEntry[], text: string): GlossaryEntry[] {
  const lower = text.toLowerCase()
  return terms.filter(({ source }) => source && lower.includes(source.toLowerCase()))
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

// ---------------------------------------------------------------------------
// CSV utilities (used in admin import route)
// ---------------------------------------------------------------------------

/**
 * Parse a CSV file with columns: source, target[, source_lang[, target_lang]]
 * Empty lang columns → null (= any language)
 */
export function parseGlossaryCSV(
  text: string,
): Array<{ source: string; target: string; sourceLang: string | null; targetLang: string | null }> {
  const lines = text.trim().split(/\r?\n/)
  const results: Array<{ source: string; target: string; sourceLang: string | null; targetLang: string | null }> = []

  for (const line of lines) {
    const cols = line.split(',').map((c) => c.replace(/^"|"$/g, '').trim())
    if (cols.length < 2 || !cols[0] || !cols[1]) continue
    if (cols[0].toLowerCase() === 'source') continue // skip header row
    results.push({
      source: cols[0],
      target: cols[1],
      sourceLang: cols[2] && cols[2] !== '' ? cols[2] : null,
      targetLang: cols[3] && cols[3] !== '' ? cols[3] : null,
    })
  }

  return results
}

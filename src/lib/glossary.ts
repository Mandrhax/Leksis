import 'server-only'
import type { GlossaryEntry } from '@/types/leksis'
import { query } from '@/lib/db'
import { filterRelevantTerms } from '@/lib/glossary-match'

// La logique pure (correspondance des termes, clauses de prompt, CSV) vit dans glossary-match.ts.
export {
  filterRelevantTerms, termMatches, langMatches,
  buildTranslationGlossaryClause, buildRewriteGlossaryClause, parseGlossaryCSV,
} from '@/lib/glossary-match'

// ---------------------------------------------------------------------------
// Server-side DB fetch
// ---------------------------------------------------------------------------

/**
 * Glossary entries eligible for a translation/rewrite operation, before looking at the text.
 *
 * - Respects user per-glossary preferences (absent row = enabled).
 * - For translation: filters entries by language pair. NULL lang = any language; an entry for « fr » also
 *   applies to « fr-CH », « fr-BE »… A source of 'auto' or '' (not detected yet) skips the source filter:
 *   the term must still appear in the text to be used.
 * - For rewrite (nullLangOnly = true): only "any → any" entries (both langs NULL) — typically brand or
 *   product names that must be preserved regardless of language.
 */
export async function fetchGlossaryCandidates(
  userId: string | undefined,
  sourceLang: string,
  targetLang: string,
  nullLangOnly = false,
): Promise<GlossaryEntry[]> {
  try {
    const params: unknown[] = []
    const conditions: string[] = []

    // Glossaires que l'utilisateur a désactivés (une ligne user_glossary_prefs n'existe que pour enabled = FALSE)
    if (userId) {
      params.push(userId)
      conditions.push(`NOT EXISTS (
        SELECT 1 FROM user_glossary_prefs ugp
        WHERE ugp.user_id = $${params.length}
          AND ugp.glossary_id = ge.glossary_id
          AND ugp.enabled = FALSE
      )`)
    }

    if (nullLangOnly) {
      conditions.push('ge.source_lang IS NULL AND ge.target_lang IS NULL')
    } else {
      if (sourceLang && sourceLang !== 'auto') {
        params.push(sourceLang)
        const p = `$${params.length}::text`
        conditions.push(`(ge.source_lang IS NULL OR ge.source_lang = ${p} OR ge.source_lang = split_part(${p}, '-', 1))`)
      }
      params.push(targetLang)
      const p = `$${params.length}::text`
      conditions.push(`(ge.target_lang IS NULL OR ge.target_lang = ${p} OR ge.target_lang = split_part(${p}, '-', 1))`)
    }

    const sql = `
      SELECT ge.id, ge.glossary_id, ge.source_term, ge.target_term, ge.source_lang, ge.target_lang, ge.match_variants
      FROM glossary_entries ge
      ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
    `

    const result = await query(sql, params)

    return result.rows.map((r: Record<string, unknown>) => ({
      id: r.id as number,
      glossaryId: r.glossary_id as number,
      source: r.source_term as string,
      target: r.target_term as string,
      sourceLang: (r.source_lang as string | null) ?? null,
      targetLang: (r.target_lang as string | null) ?? null,
      matchVariants: r.match_variants === true,
    }))
  } catch {
    // Never break a translation because of glossary errors
    return []
  }
}

/** Candidates, then only the entries whose source term appears in `sourceText`. */
export async function fetchGlossaryEntries(
  userId: string | undefined,
  sourceLang: string,
  targetLang: string,
  sourceText: string,
  nullLangOnly = false,
): Promise<GlossaryEntry[]> {
  const candidates = await fetchGlossaryCandidates(userId, sourceLang, targetLang, nullLangOnly)
  return filterRelevantTerms(candidates, sourceText)
}

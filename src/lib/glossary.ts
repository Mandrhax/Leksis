import 'server-only'
import type { GlossaryEntry } from '@/types/leksis'
import { query } from '@/lib/db'
import { filterRelevantTerms } from '@/lib/glossary-match'

// La logique pure (correspondance des termes, clauses de prompt) vit dans glossary-match.ts ; le CSV dans glossary-csv.ts.
export {
  filterRelevantTerms, termMatches, langMatches,
  buildTranslationGlossaryClause, buildRewriteGlossaryClause,
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
  const key = `${userId ?? ''}\u0000${sourceLang}\u0000${targetLang}\u0000${nullLangOnly}`
  const hit = candidateCache.get(key)
  if (hit && Date.now() - hit.at < CANDIDATE_TTL_MS) return hit.entries
  const version = glossaryVersion
  const entries = await queryGlossaryCandidates(userId, sourceLang, targetLang, nullLangOnly)
  if (entries === null) return []   // base injoignable : jamais mis en cache
  // Une écriture survenue pendant la requête rend ce résultat douteux : pas mis en cache
  if (version === glossaryVersion) {
    if (candidateCache.size >= CANDIDATE_MAX_KEYS) candidateCache.clear()
    candidateCache.set(key, { entries, at: Date.now() })
  }
  return entries
}

// Cache des candidats : la requête parcourt tout le glossaire (les conditions « IS NULL OR » empêchent tout index)
// et partait à chaque traduction, donc à chaque pause de frappe. En mémoire (une seule instance), vidé à chaque
// modification d'un glossaire ou d'une préférence (glossaryChanged) ; le TTL ne couvre qu'une écriture hors appli.
const CANDIDATE_TTL_MS = 60_000
const CANDIDATE_MAX_KEYS = 1000
const candidateCache = new Map<string, { entries: GlossaryEntry[]; at: number }>()
let glossaryVersion = 0

/** À appeler après toute écriture dans les glossaires, leurs termes ou les préférences des utilisateurs. */
export function glossaryChanged(): void {
  glossaryVersion++
  candidateCache.clear()
}

async function queryGlossaryCandidates(
  userId: string | undefined,
  sourceLang: string,
  targetLang: string,
  nullLangOnly: boolean,
): Promise<GlossaryEntry[] | null> {
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
    return null
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

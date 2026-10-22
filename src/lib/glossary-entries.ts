import 'server-only'
import { z } from 'zod'
import { query, withTransaction } from '@/lib/db'
import type { CsvRow } from '@/lib/glossary-csv'

// Terme de glossaire, tel que l'admin le saisit (création et modification)
export const entrySchema = z.object({
  source: z.string().trim().min(1).max(500),
  target: z.string().trim().min(1).max(500),
  sourceLang: z.string().max(20).nullable().optional(),
  targetLang: z.string().max(20).nullable().optional(),
  matchVariants: z.boolean().optional(),
})

export const ENTRY_COLUMNS = 'id, glossary_id, source_term, target_term, source_lang, target_lang, match_variants, created_at'

export function entryFromRow(r: Record<string, unknown>) {
  return {
    id: r.id as number,
    glossaryId: r.glossary_id as number,
    source: r.source_term as string,
    target: r.target_term as string,
    sourceLang: (r.source_lang as string | null) ?? null,
    targetLang: (r.target_lang as string | null) ?? null,
    matchVariants: r.match_variants === true,
    createdAt: r.created_at,
  }
}

/**
 * Un terme identique existe-t-il déjà dans ce glossaire ? Même terme source (sans tenir compte de la casse)
 * et même paire de langues : deux traductions pour un même terme se contrediraient dans le prompt.
 */
export async function findDuplicateEntry(
  glossaryId: number,
  source: string,
  sourceLang: string | null,
  targetLang: string | null,
  excludeId?: number,
): Promise<{ id: number; target: string } | null> {
  const r = await query(
    `SELECT id, target_term FROM glossary_entries
     WHERE glossary_id = $1
       AND lower(source_term) = lower($2)
       AND source_lang IS NOT DISTINCT FROM $3::varchar
       AND target_lang IS NOT DISTINCT FROM $4::varchar
       AND ($5::int IS NULL OR id <> $5::int)
     LIMIT 1`,
    [glossaryId, source, sourceLang, targetLang, excludeId ?? null],
  )
  const row = r.rows[0]
  return row ? { id: row.id as number, target: row.target_term as string } : null
}

/** Échappe % _ \ pour un ILIKE : la recherche de l'admin est littérale. */
export function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, m => `\\${m}`)}%`
}

export type ImportOutcome = { imported: number; duplicates: number }

const INSERT_CHUNK = 1000

/**
 * Importe des lignes CSV déjà validées dans un glossaire, en une seule transaction : tout ou rien.
 * Un terme déjà présent (même terme sans casse + mêmes langues), dans la base ou plus haut dans le fichier,
 * est ignoré et compté dans `duplicates`. Renvoie null si le glossaire n'existe pas.
 */
export async function importGlossaryRows(glossaryId: number, rows: CsvRow[]): Promise<ImportOutcome | null> {
  return withTransaction(async (q) => {
    const exists = await q('SELECT 1 FROM glossaries WHERE id = $1', [glossaryId])
    if (!exists.rows.length) return null

    const key = (source: string, sl: string | null, tl: string | null) => `${source.toLowerCase()}\u0000${sl ?? ''}\u0000${tl ?? ''}`
    const seen = new Set<string>()
    const current = await q(
      'SELECT source_term, source_lang, target_lang FROM glossary_entries WHERE glossary_id = $1',
      [glossaryId],
    )
    for (const r of current.rows) seen.add(key(r.source_term as string, r.source_lang as string | null, r.target_lang as string | null))

    const fresh: CsvRow[] = []
    let duplicates = 0
    for (const row of rows) {
      const k = key(row.source, row.sourceLang, row.targetLang)
      if (seen.has(k)) { duplicates++; continue }
      seen.add(k)
      fresh.push(row)
    }

    for (let i = 0; i < fresh.length; i += INSERT_CHUNK) {
      const chunk = fresh.slice(i, i + INSERT_CHUNK)
      await q(
        `INSERT INTO glossary_entries (glossary_id, source_term, target_term, source_lang, target_lang, match_variants)
         SELECT $1, s, t, sl, tl, mv
         FROM unnest($2::text[], $3::text[], $4::text[], $5::text[], $6::boolean[]) AS x(s, t, sl, tl, mv)`,
        [
          glossaryId,
          chunk.map(r => r.source), chunk.map(r => r.target),
          chunk.map(r => r.sourceLang), chunk.map(r => r.targetLang),
          chunk.map(r => r.matchVariants),
        ],
      )
    }
    return { imported: fresh.length, duplicates }
  })
}

/** Ce qu'on garde d'un terme dans le journal d'audit (ni identifiants internes ni dates). */
export function termDetail(e: { source: string; target: string; sourceLang: string | null; targetLang: string | null; matchVariants?: boolean }) {
  return { source: e.source, target: e.target, sourceLang: e.sourceLang, targetLang: e.targetLang, matchVariants: e.matchVariants === true }
}

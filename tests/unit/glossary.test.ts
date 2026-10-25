import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'

// `@/lib/db` backed by an in-memory PostgreSQL loaded with the real schema
const pg = vi.hoisted(() => ({ db: null as unknown as PGlite }))
vi.mock('@/lib/db', () => ({
  query: async (text: string, params?: unknown[]) => {
    const r = await pg.db.query(text, params)
    return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length }
  },
  withTransaction: async (fn: (q: unknown) => Promise<unknown>) =>
    pg.db.transaction(async tx => fn(async (text: string, params?: unknown[]) => {
      const r = await tx.query(text, params)
      return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length }
    })),
}))

import { fetchGlossaryCandidates, fetchGlossaryEntries, glossaryChanged } from '@/lib/glossary'
import { findDuplicateEntry, importGlossaryRows, likePattern } from '@/lib/glossary-entries'
import type { CsvRow } from '@/lib/glossary-csv'
import { filterRelevantTerms, langMatches, termMatches, MAX_PROMPT_TERMS } from '@/lib/glossary-match'
import type { GlossaryEntry } from '@/types/leksis'

const schema = readFileSync(new URL('../../docker/init-schema.sql', import.meta.url), 'utf8').replace(/CREATE EXTENSION[^\n]*\n/g, '')

const entry = (source: string, matchVariants = false, id = 1): GlossaryEntry => (
  { id, glossaryId: 1, source, target: 'x', sourceLang: null, targetLang: null, matchVariants }
)

describe('termMatches', () => {
  it('matches whole words only', () => {
    expect(termMatches(entry('art'), 'Le grand art du vitrail')).toBe(true)
    expect(termMatches(entry('art'), 'La partie adverse')).toBe(false)
    expect(termMatches(entry('art'), 'Un artiste')).toBe(false)
  })

  it('ignores case and accents', () => {
    expect(termMatches(entry('résumé'), 'Voici mon RESUME')).toBe(true)
    expect(termMatches(entry('Resume'), 'un résumé')).toBe(true)
  })

  it('treats punctuation as a word boundary', () => {
    expect(termMatches(entry('contrat'), 'Le contrat, signé hier.')).toBe(true)
    expect(termMatches(entry('contrat'), "l'contrat")).toBe(true)
  })

  it('matches multi-word terms across spaces and line breaks', () => {
    expect(termMatches(entry('machine learning'), 'Le machine\n  learning évolue')).toBe(true)
  })

  it('handles terms with regex special characters', () => {
    expect(termMatches(entry('C++'), 'Un développeur C++ senior')).toBe(true)
    expect(termMatches(entry('(draft)'), 'Document (draft) v2')).toBe(true)
  })

  it('does not match a word ending without the variants option', () => {
    expect(termMatches(entry('contrat'), 'Les contrats sont signés')).toBe(false)
  })

  it('matches word endings only when asked to', () => {
    expect(termMatches(entry('contrat', true), 'Les contrats sont signés')).toBe(true)
    expect(termMatches(entry('Kunde', true), 'Die Kunden warten')).toBe(true)
    // beyond a few letters it is another word
    expect(termMatches(entry('art', true), 'Un artisanat local')).toBe(false)
    // a different word that merely starts with the term stays out of reach of whole-word matching
    expect(termMatches(entry('art', true), 'Une partie')).toBe(false)
  })

  it('falls back to substring search for scripts without word separators', () => {
    expect(termMatches(entry('契約'), 'この契約は有効です')).toBe(true)
    expect(termMatches(entry('契約'), 'これは別の文です')).toBe(false)
  })

  it('never matches an empty term', () => {
    expect(termMatches(entry('  '), 'anything')).toBe(false)
  })
})

describe('filterRelevantTerms', () => {
  it('keeps only the terms found in the text, longest first', () => {
    const terms = [entry('machine', false, 1), entry('machine learning', false, 2), entry('absent', false, 3)]
    const out = filterRelevantTerms(terms, 'Le machine learning et la machine')
    expect(out.map(t => t.id)).toEqual([2, 1])
  })

  it('caps the number of terms sent to the model', () => {
    const terms = Array.from({ length: MAX_PROMPT_TERMS + 20 }, (_, i) => entry(`mot${i}`, false, i))
    const text = terms.map(t => t.source).join(' ')
    expect(filterRelevantTerms(terms, text)).toHaveLength(MAX_PROMPT_TERMS)
  })
})

describe('langMatches', () => {
  it('applies a base-language entry to its regional variants, not the reverse', () => {
    expect(langMatches('fr', 'fr')).toBe(true)
    expect(langMatches('fr', 'fr-CH')).toBe(true)
    expect(langMatches('fr-CH', 'fr-CH')).toBe(true)
    expect(langMatches('fr-CH', 'fr')).toBe(false)
    expect(langMatches('fr', 'de')).toBe(false)
  })

  it('treats a missing entry language or an undetected source as a match', () => {
    expect(langMatches(null, 'de')).toBe(true)
    expect(langMatches('fr', 'auto')).toBe(true)
    expect(langMatches('fr', '')).toBe(true)
  })
})

describe('fetchGlossaryCandidates (database)', () => {
  let glossaryId: number
  const add = (source: string, target: string, sourceLang: string | null, targetLang: string | null, variants = false) =>
    pg.db.query(
      'INSERT INTO glossary_entries (glossary_id, source_term, target_term, source_lang, target_lang, match_variants) VALUES ($1,$2,$3,$4,$5,$6)',
      [glossaryId, source, target, sourceLang, targetLang, variants],
    )

  beforeEach(async () => {
    pg.db = new PGlite()
    await pg.db.exec(schema)
    const g = await pg.db.query<{ id: number }>("INSERT INTO glossaries (name) VALUES ('Legal') RETURNING id")
    glossaryId = g.rows[0].id
    await add('contrat', 'Vertrag', 'fr', 'de', true)
    await add('Leksis', 'Leksis', null, null)
    await add('facture', 'Rechnung', 'fr', 'de')
    await add('invoice', 'Rechnung', 'en', 'de')
    glossaryChanged()   // fresh database: nothing from a previous test may be served from the cache
  })

  const sources = async (src: string, tgt: string, nullOnly = false) =>
    (await fetchGlossaryCandidates(undefined, src, tgt, nullOnly)).map(e => e.source).sort()

  it('applies fr → de entries to the Swiss variants', async () => {
    expect(await sources('fr-CH', 'de-CH')).toEqual(['Leksis', 'contrat', 'facture'])
    expect(await sources('fr', 'de')).toEqual(['Leksis', 'contrat', 'facture'])
  })

  it('skips entries of another language pair', async () => {
    expect(await sources('fr', 'it')).toEqual(['Leksis'])
    expect(await sources('en', 'de')).toEqual(['Leksis', 'invoice'])
  })

  it('does not filter on the source language when it is not detected yet', async () => {
    expect(await sources('auto', 'de')).toEqual(['Leksis', 'contrat', 'facture', 'invoice'])
    expect(await sources('', 'de')).toEqual(['Leksis', 'contrat', 'facture', 'invoice'])
  })

  it('reads the variants flag', async () => {
    const all = await fetchGlossaryCandidates(undefined, 'fr', 'de')
    expect(all.find(e => e.source === 'contrat')?.matchVariants).toBe(true)
    expect(all.find(e => e.source === 'facture')?.matchVariants).toBe(false)
  })

  it('keeps only language-independent entries for rewriting', async () => {
    expect(await sources('', '', true)).toEqual(['Leksis'])
  })

  it('then keeps the terms present in the text', async () => {
    const found = await fetchGlossaryEntries(undefined, 'fr', 'de', 'Les contrats de Leksis')
    expect(found.map(e => e.source).sort()).toEqual(['Leksis', 'contrat'])
  })

  it('serves repeated lookups from memory until a glossary changes', async () => {
    expect(await sources('fr', 'de')).toEqual(['Leksis', 'contrat', 'facture'])
    await add('avenant', 'Nachtrag', 'fr', 'de')
    expect(await sources('fr', 'de')).toEqual(['Leksis', 'contrat', 'facture'])
    glossaryChanged()
    expect(await sources('fr', 'de')).toEqual(['Leksis', 'avenant', 'contrat', 'facture'])
  })

  it('respects the glossaries a user turned off', async () => {
    const u = await pg.db.query<{ id: string }>("INSERT INTO users (email) VALUES ('u@x.ch') RETURNING id")
    await pg.db.query('INSERT INTO user_glossary_prefs (user_id, glossary_id, enabled) VALUES ($1, $2, FALSE)', [u.rows[0].id, glossaryId])
    expect(await fetchGlossaryCandidates(u.rows[0].id, 'fr', 'de')).toEqual([])
  })
})

describe('findDuplicateEntry (database)', () => {
  let glossaryId: number
  let contractId: number

  beforeEach(async () => {
    pg.db = new PGlite()
    await pg.db.exec(schema)
    const g = await pg.db.query<{ id: number }>("INSERT INTO glossaries (name) VALUES ('Legal') RETURNING id")
    glossaryId = g.rows[0].id
    const e = await pg.db.query<{ id: number }>(
      "INSERT INTO glossary_entries (glossary_id, source_term, target_term, source_lang, target_lang) VALUES ($1, 'Contrat', 'Vertrag', 'fr', 'de') RETURNING id",
      [glossaryId],
    )
    contractId = e.rows[0].id
    await pg.db.query(
      "INSERT INTO glossary_entries (glossary_id, source_term, target_term) VALUES ($1, 'Leksis', 'Leksis')",
      [glossaryId],
    )
  })

  it('finds the same term whatever its case, for the same language pair', async () => {
    expect(await findDuplicateEntry(glossaryId, 'contrat', 'fr', 'de')).toEqual({ id: contractId, target: 'Vertrag' })
  })

  it('treats another language pair as a different term', async () => {
    expect(await findDuplicateEntry(glossaryId, 'contrat', 'fr', 'it')).toBeNull()
    expect(await findDuplicateEntry(glossaryId, 'contrat', null, null)).toBeNull()
  })

  it('matches terms that apply to any language', async () => {
    expect((await findDuplicateEntry(glossaryId, 'LEKSIS', null, null))?.target).toBe('Leksis')
  })

  it('ignores the entry being edited', async () => {
    expect(await findDuplicateEntry(glossaryId, 'Contrat', 'fr', 'de', contractId)).toBeNull()
  })

  it('looks only inside the given glossary', async () => {
    const other = await pg.db.query<{ id: number }>("INSERT INTO glossaries (name) VALUES ('Other') RETURNING id")
    expect(await findDuplicateEntry(other.rows[0].id, 'Contrat', 'fr', 'de')).toBeNull()
  })
})

describe('likePattern', () => {
  it('escapes the LIKE wildcards so a search is literal', async () => {
    expect(likePattern('50%_off')).toBe('%50\\%\\_off%')
    expect(likePattern('a\\b')).toBe('%a\\\\b%')
    pg.db = new PGlite()
    const r = await pg.db.query<{ ok: boolean }>('SELECT $1::text ILIKE $2 AS ok', ['100% sure', likePattern('100%')])
    expect(r.rows[0].ok).toBe(true)
    const none = await pg.db.query<{ ok: boolean }>('SELECT $1::text ILIKE $2 AS ok', ['1000 sure', likePattern('100%')])
    expect(none.rows[0].ok).toBe(false)
  })
})

describe('importGlossaryRows (database)', () => {
  let glossaryId: number

  const row = (line: number, source: string, target: string, sourceLang: string | null = null, targetLang: string | null = null, matchVariants = false): CsvRow =>
    ({ line, source, target, sourceLang, targetLang, matchVariants })

  const stored = async () =>
    (await pg.db.query<{ source_term: string; target_term: string; match_variants: boolean }>(
      'SELECT source_term, target_term, match_variants FROM glossary_entries WHERE glossary_id = $1 ORDER BY id', [glossaryId],
    )).rows

  beforeEach(async () => {
    pg.db = new PGlite()
    await pg.db.exec(schema)
    glossaryId = (await pg.db.query<{ id: number }>("INSERT INTO glossaries (name) VALUES ('Legal') RETURNING id")).rows[0].id
  })

  it('inserts every valid row, keeping the variants flag', async () => {
    const out = await importGlossaryRows(glossaryId, [row(2, 'contrat', 'Vertrag', 'fr', 'de', true), row(3, 'Leksis', 'Leksis')])
    expect(out).toEqual({ imported: 2, duplicates: 0 })
    expect(await stored()).toEqual([
      { source_term: 'contrat', target_term: 'Vertrag', match_variants: true },
      { source_term: 'Leksis', target_term: 'Leksis', match_variants: false },
    ])
  })

  it('skips terms already in the glossary and repeated inside the file', async () => {
    await pg.db.query("INSERT INTO glossary_entries (glossary_id, source_term, target_term, source_lang, target_lang) VALUES ($1, 'Contrat', 'Vertrag', 'fr', 'de')", [glossaryId])
    const out = await importGlossaryRows(glossaryId, [
      row(2, 'contrat', 'Anderer', 'fr', 'de'), // already there (case-insensitive)
      row(3, 'facture', 'Rechnung', 'fr', 'de'),
      row(4, 'FACTURE', 'Faktura', 'fr', 'de'), // repeated in the file
      row(5, 'contrat', 'Vertrag', 'fr', 'it'), // another language pair: kept
    ])
    expect(out).toEqual({ imported: 2, duplicates: 2 })
    expect((await stored()).map(r => r.target_term)).toEqual(['Vertrag', 'Rechnung', 'Vertrag'])
  })

  it('imports a large file in one go', async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => row(i + 2, `terme${i}`, `Begriff${i}`, 'fr', 'de'))
    expect(await importGlossaryRows(glossaryId, rows)).toEqual({ imported: 2500, duplicates: 0 })
    expect((await stored())).toHaveLength(2500)
  })

  it('returns null for a glossary that does not exist, and writes nothing', async () => {
    expect(await importGlossaryRows(9999, [row(2, 'a', 'b')])).toBeNull()
    expect(await stored()).toEqual([])
  })

  it('is all or nothing: a failure rolls the whole import back', async () => {
    const tooLongLang = 'x'.repeat(30) // longer than VARCHAR(20): the database refuses it
    await expect(importGlossaryRows(glossaryId, [row(2, 'ok', 'ok'), row(3, 'bad', 'bad', tooLongLang)])).rejects.toThrow()
    expect(await stored()).toEqual([])
  })
})

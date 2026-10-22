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
}))

import { fetchGlossaryCandidates, fetchGlossaryEntries } from '@/lib/glossary'
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

  it('respects the glossaries a user turned off', async () => {
    const u = await pg.db.query<{ id: string }>("INSERT INTO users (email) VALUES ('u@x.ch') RETURNING id")
    await pg.db.query('INSERT INTO user_glossary_prefs (user_id, glossary_id, enabled) VALUES ($1, $2, FALSE)', [u.rows[0].id, glossaryId])
    expect(await fetchGlossaryCandidates(u.rows[0].id, 'fr', 'de')).toEqual([])
  })
})

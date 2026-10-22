import { describe, expect, it } from 'vitest'
import { buildGlossaryCsv, detectDelimiter, parseCsvRecords, parseGlossaryCsv } from '@/lib/glossary-csv'

const known = new Map([['fr', 'fr'], ['de', 'de'], ['fr-ch', 'fr-CH'], ['de-ch', 'de-CH']])
const resolve = (c: string) => known.get(c.toLowerCase()) ?? null

describe('detectDelimiter', () => {
  it('picks the most frequent separator of the first line, comma by default', () => {
    expect(detectDelimiter('a,b,c')).toBe(',')
    expect(detectDelimiter('a;b;c')).toBe(';')
    expect(detectDelimiter('a\tb\tc')).toBe('\t')
    expect(detectDelimiter('single')).toBe(',')
    expect(detectDelimiter('')).toBe(',')
  })

  it('ignores separators inside quotes', () => {
    expect(detectDelimiter('"Dupont, Jean";"Jean Dupont"')).toBe(';')
  })
})

describe('parseCsvRecords', () => {
  it('handles quoted separators, doubled quotes and line breaks inside a field', () => {
    const recs = parseCsvRecords('a,"b, c","say ""hi""","two\nlines"\nx,y,z,w', ',')
    expect(recs[0].cells).toEqual(['a', 'b, c', 'say "hi"', 'two\nlines'])
    expect(recs[1].cells).toEqual(['x', 'y', 'z', 'w'])
  })

  it('numbers records by their first physical line, even after a multi-line field', () => {
    const recs = parseCsvRecords('a,"x\ny"\nb,c\n\nd,e', ',')
    expect(recs.map(r => r.line)).toEqual([1, 3, 5])
  })

  it('accepts Windows line endings and a missing final newline', () => {
    expect(parseCsvRecords('a,b\r\nc,d', ',').map(r => r.cells)).toEqual([['a', 'b'], ['c', 'd']])
  })
})

describe('parseGlossaryCsv', () => {
  it('reads a plain file with a header', () => {
    const out = parseGlossaryCsv('source,target,source_lang,target_lang\ncontrat,Vertrag,fr,de\nLeksis,Leksis,,', resolve)
    expect(out.rejected).toEqual([])
    expect(out.rows).toEqual([
      { line: 2, source: 'contrat', target: 'Vertrag', sourceLang: 'fr', targetLang: 'de', matchVariants: false },
      { line: 3, source: 'Leksis', target: 'Leksis', sourceLang: null, targetLang: null, matchVariants: false },
    ])
  })

  it('reads an Excel-style file: semicolons, BOM, quoted terms with commas', () => {
    const out = parseGlossaryCsv('﻿source;target\n"Dupont, Jean";"Jean Dupont"\n', resolve)
    expect(out.delimiter).toBe(';')
    expect(out.rows.map(r => [r.source, r.target])).toEqual([['Dupont, Jean', 'Jean Dupont']])
  })

  it('works without a header row', () => {
    const out = parseGlossaryCsv('contrat,Vertrag', resolve)
    expect(out.rows).toHaveLength(1)
  })

  it('reads the optional match_variants column', () => {
    const out = parseGlossaryCsv('a,b,,,true\nc,d,,,false\ne,f,,,oui\ng,h', resolve)
    expect(out.rows.map(r => r.matchVariants)).toEqual([true, false, true, false])
  })

  it('canonicalises language codes and rejects unknown ones', () => {
    const out = parseGlossaryCsv('a,b,FR-ch,DE\nc,d,xx,de', resolve)
    expect(out.rows).toHaveLength(1)
    expect(out.rows[0]).toMatchObject({ sourceLang: 'fr-CH', targetLang: 'de' })
    expect(out.rejected).toEqual([{ line: 2, reason: 'invalid_lang' }])
  })

  it('reports rejected lines with their number and reason, and keeps reading', () => {
    const long = 'x'.repeat(501)
    const out = parseGlossaryCsv(`ok,fine\n,missing source\nmissing target,\n${long},t\nlast,one`, resolve)
    expect(out.rows.map(r => r.source)).toEqual(['ok', 'last'])
    expect(out.rejected).toEqual([
      { line: 2, reason: 'missing_term' },
      { line: 3, reason: 'missing_term' },
      { line: 4, reason: 'too_long' },
    ])
  })

  it('skips blank lines and lines made only of separators silently', () => {
    const out = parseGlossaryCsv('a,b\n\n,,,\n   \nc,d', resolve)
    expect(out.rows).toHaveLength(2)
    expect(out.rejected).toEqual([])
  })
})

describe('buildGlossaryCsv', () => {
  const entries = [
    { source: 'Dupont, Jean', target: 'Jean "JD" Dupont', sourceLang: 'fr', targetLang: null, matchVariants: true },
    { source: 'Leksis', target: 'Leksis', sourceLang: null, targetLang: null },
  ]

  it('quotes the terms, adds a BOM and the match_variants column', () => {
    const csv = buildGlossaryCsv(entries)
    expect(csv.startsWith('﻿source,target,source_lang,target_lang,match_variants\r\n')).toBe(true)
    expect(csv).toContain('"Dupont, Jean","Jean ""JD"" Dupont",fr,,true')
    expect(csv).toContain('"Leksis","Leksis",,,false')
  })

  it('round-trips through the importer, commas and quotes included', () => {
    const back = parseGlossaryCsv(buildGlossaryCsv(entries), resolve)
    expect(back.rejected).toEqual([])
    expect(back.rows.map(({ source, target, sourceLang, targetLang, matchVariants }) => (
      { source, target, sourceLang, targetLang, matchVariants }
    ))).toEqual([
      { source: 'Dupont, Jean', target: 'Jean "JD" Dupont', sourceLang: 'fr', targetLang: null, matchVariants: true },
      { source: 'Leksis', target: 'Leksis', sourceLang: null, targetLang: null, matchVariants: false },
    ])
  })
})

// Import / export CSV des glossaires. Module pur (sans base ni `server-only`) : utilisé par la route d'import,
// par le bouton d'export du navigateur et par les tests.

export const MAX_TERM_LENGTH = 500
export const MAX_CSV_ROWS = 5000

export type CsvRejectReason = 'missing_term' | 'too_long' | 'invalid_lang'

export type CsvRow = {
  /** Numéro de ligne dans le fichier (1 = première ligne, en-tête compris) */
  line: number
  source: string
  target: string
  sourceLang: string | null
  targetLang: string | null
  matchVariants: boolean
}

export type CsvIssue = { line: number; reason: CsvRejectReason }

export type ParsedGlossaryCsv = { rows: CsvRow[]; rejected: CsvIssue[]; delimiter: string }

const DELIMITERS = [',', ';', '\t'] as const

/** Séparateur le plus fréquent sur la première ligne non vide (hors guillemets) ; la virgule par défaut. */
export function detectDelimiter(text: string): string {
  const first = text.split(/\r?\n/).find(l => l.trim() !== '') ?? ''
  let inQuotes = false
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 }
  for (const ch of first) {
    if (ch === '"') inQuotes = !inQuotes
    else if (!inQuotes && ch in counts) counts[ch]++
  }
  let best = ','
  for (const d of DELIMITERS) if (counts[d] > counts[best]) best = d
  return best
}

/** Découpe un CSV (RFC 4180) : guillemets, guillemets doublés, séparateurs et retours à la ligne dans un champ. */
export function parseCsvRecords(text: string, delimiter: string): { line: number; cells: string[] }[] {
  const records: { line: number; cells: string[] }[] = []
  let cells: string[] = []
  let field = ''
  let inQuotes = false
  let line = 1
  let recordLine = 1
  let sawContent = false

  const endField = () => { cells.push(field); field = '' }
  const endRecord = () => {
    endField()
    if (sawContent) records.push({ line: recordLine, cells })
    cells = []
    sawContent = false
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else inQuotes = false
      } else {
        if (ch === '\n') line++
        field += ch
      }
      continue
    }
    if (ch === '"' && field === '') { inQuotes = true; sawContent = true; continue }
    if (ch === delimiter) { endField(); sawContent = true; continue }
    if (ch === '\r') continue
    if (ch === '\n') {
      endRecord()
      line++
      recordLine = line
      continue
    }
    field += ch
    if (ch.trim() !== '') sawContent = true
  }
  endRecord()
  return records
}

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'y', 'x', 'oui', 'ja', 'si', 'sì'])

/**
 * Lit un CSV `source,target[,source_lang[,target_lang[,match_variants]]]`.
 * `resolveLang` renvoie le code de langue officiel (ou null s'il est inconnu) : « FR-ch » devient « fr-CH ».
 * Une ligne invalide n'arrête pas la lecture : elle est signalée dans `rejected` avec son motif.
 */
export function parseGlossaryCsv(
  text: string,
  resolveLang: (code: string) => string | null = c => c,
): ParsedGlossaryCsv {
  const clean = text.replace(/^﻿/, '')
  const delimiter = detectDelimiter(clean)
  const records = parseCsvRecords(clean, delimiter)

  const rows: CsvRow[] = []
  const rejected: CsvIssue[] = []

  records.forEach(({ line, cells }, index) => {
    const c = cells.map(v => v.trim())
    // En-tête : première ligne dont la première colonne est « source »
    if (index === 0 && /^(source|source_term)$/i.test(c[0] ?? '')) return
    // Ligne vide ou ne contenant que des séparateurs
    if (c.every(v => v === '')) return

    const [source = '', target = '', rawSrcLang = '', rawTgtLang = '', rawVariants = ''] = c
    if (!source || !target) { rejected.push({ line, reason: 'missing_term' }); return }
    if (source.length > MAX_TERM_LENGTH || target.length > MAX_TERM_LENGTH) { rejected.push({ line, reason: 'too_long' }); return }

    const sourceLang = rawSrcLang ? resolveLang(rawSrcLang) : null
    const targetLang = rawTgtLang ? resolveLang(rawTgtLang) : null
    if ((rawSrcLang && !sourceLang) || (rawTgtLang && !targetLang)) { rejected.push({ line, reason: 'invalid_lang' }); return }

    rows.push({ line, source, target, sourceLang, targetLang, matchVariants: TRUE_VALUES.has(rawVariants.toLowerCase()) })
  })

  return { rows, rejected, delimiter }
}

/** CSV d'export : tous les champs texte entre guillemets, BOM UTF-8 pour qu'Excel lise bien les accents. */
export function buildGlossaryCsv(entries: Array<{
  source: string; target: string; sourceLang: string | null; targetLang: string | null; matchVariants?: boolean
}>): string {
  const quote = (s: string) => `"${s.replace(/"/g, '""')}"`
  const header = 'source,target,source_lang,target_lang,match_variants'
  const rows = entries.map(e => [
    quote(e.source), quote(e.target), e.sourceLang ?? '', e.targetLang ?? '', e.matchVariants ? 'true' : 'false',
  ].join(','))
  return '﻿' + [header, ...rows].join('\r\n') + '\r\n'
}

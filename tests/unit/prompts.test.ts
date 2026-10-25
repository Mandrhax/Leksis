import { describe, expect, it } from 'vitest'
import {
  buildCorrectPrompt, buildDocumentTranslationPrompt, buildLangClause, buildMarkdownTranslationPrompt,
  buildOcrPrompt, buildRewritePrompt, buildTranslationPrompt,
} from '@/lib/prompts'

const base = { sourceLang: 'English', sourceCode: 'en', targetLang: 'French', targetCode: 'fr', text: 'Hello world' }

describe('buildTranslationPrompt', () => {
  it('names both languages and ends with the text to translate', () => {
    const p = buildTranslationPrompt(base)
    expect(p).toContain('English (en) to French (fr) translator')
    expect(p.endsWith('Please translate the following English text into French:\n\nHello world')).toBe(true)
  })
  it('adds the formality line only when a formality is given', () => {
    expect(buildTranslationPrompt(base)).not.toContain('form of address')
    expect(buildTranslationPrompt({ ...base, formality: null })).not.toContain('form of address')
    expect(buildTranslationPrompt({ ...base, formality: 'Formal' })).toContain('formal form of address in French')
    expect(buildTranslationPrompt({ ...base, formality: 'Informal' })).toContain('informal form of address in French')
  })
  it('asks to keep the source register unless a formality is chosen', () => {
    expect(buildTranslationPrompt(base)).toContain('Keep the register of the original')
    expect(buildTranslationPrompt({ ...base, formality: null })).toContain('Keep the register of the original')
    expect(buildTranslationPrompt({ ...base, formality: 'Formal' })).not.toContain('Keep the register')
    expect(buildDocumentTranslationPrompt({ segments: 'a', sourceLang: 'French', targetLang: 'German' })).toContain('Keep the register of the original')
  })
  it('puts the glossary clause in the document prompt, before the segments', () => {
    const p = buildDocumentTranslationPrompt({ segments: 'a ||| b', sourceLang: 'French', targetLang: 'German', glossaryClause: 'GLOSSARY\n' })
    expect(p).toContain('GLOSSARY\n')
    expect(p.indexOf('GLOSSARY')).toBeLessThan(p.indexOf('a ||| b'))
  })
  it('injects the glossary clause before the instruction to output only the translation', () => {
    const clause = 'Use these terms: cat = chat.\n'
    const p = buildTranslationPrompt({ ...base, glossaryClause: clause })
    expect(p.indexOf(clause)).toBeGreaterThan(0)
    expect(p.indexOf(clause)).toBeLessThan(p.indexOf('Produce only the French translation'))
  })
})

describe('buildDocumentTranslationPrompt', () => {
  it('asks to preserve every ||| separator and appends the segments', () => {
    const p = buildDocumentTranslationPrompt({ segments: 'a ||| b', sourceLang: 'German', targetLang: 'Italian' })
    expect(p).toContain('German to Italian')
    expect(p).toContain('preserve every ||| token')
    expect(p.endsWith('a ||| b')).toBe(true)
  })
  it('tells the model how many segments to return when there are several', () => {
    const base = { segments: 'a ||| b ||| c', sourceLang: 'German', targetLang: 'Italian' }
    expect(buildDocumentTranslationPrompt({ ...base, segmentCount: 3 })).toContain('exactly 3 segments and 2 ||| tokens')
    expect(buildDocumentTranslationPrompt({ ...base, segmentCount: 1 })).not.toContain('There are exactly')
    expect(buildDocumentTranslationPrompt(base)).not.toContain('There are exactly')
  })
})

describe('buildOcrPrompt / buildMarkdownTranslationPrompt', () => {
  it('OCR prompt asks for Markdown with tables and no commentary', () => {
    const p = buildOcrPrompt()
    expect(p).toContain('Markdown table')
    expect(p).toContain('Do not add any commentary')
  })
  it('Markdown translation keeps the structure and ends with the text', () => {
    const p = buildMarkdownTranslationPrompt({ sourceLang: 'English', targetLang: 'German', text: '## Hi' })
    expect(p).toContain('from English to German')
    expect(p).toContain('Do not translate Markdown syntax')
    expect(p.endsWith('## Hi')).toBe(true)
  })
})

describe('buildRewritePrompt', () => {
  const opts = { instruction: 'in a friendly tone', langClause: buildLangClause('French'), text: 'Salut' }

  it('puts the tone instruction, language clause and text in the user prompt, rules in the system prompt', () => {
    const { system, prompt } = buildRewritePrompt({ ...opts, length: 'Keep' })
    expect(system).toContain('expert editor')
    expect(prompt).toContain('Rewrite the following text in a friendly tone.')
    expect(prompt).toContain('You MUST respond in French only')
    expect(prompt.endsWith('\nSalut')).toBe(true)
  })
  it.each([
    ['Shorter', 'significantly shorter'],
    ['Longer', 'Expand the text'],
    ['Keep', 'roughly the same length'],
  ] as const)('length %s', (length, expected) => {
    expect(buildRewritePrompt({ ...opts, length }).prompt).toContain(expected)
  })
  it('includes the glossary clause when given', () => {
    expect(buildRewritePrompt({ ...opts, length: 'Keep', glossaryClause: 'GLOSSARY\n' }).prompt).toContain('GLOSSARY\n')
  })
})

describe('buildCorrectPrompt', () => {
  it('asks for minimal corrections and forbids rephrasing', () => {
    const { system, prompt } = buildCorrectPrompt({ langClause: buildLangClause('English'), text: 'teh cat' })
    expect(system).toContain('minimum number of changes')
    expect(system).toContain('Do not rephrase')
    expect(prompt).toContain('You MUST respond in English only')
    expect(prompt.endsWith('\nteh cat')).toBe(true)
  })
})

describe('buildTranslationPrompt — context of an incremental translation', () => {
  const base = { sourceLang: 'French', sourceCode: 'fr', targetLang: 'German', targetCode: 'de-CH', text: 'Troisième paragraphe.' }

  it('without context, the prompt is exactly the one of a whole-text translation', () => {
    expect(buildTranslationPrompt({ ...base, context: undefined })).toBe(buildTranslationPrompt(base))
    expect(buildTranslationPrompt(base)).not.toContain('For context only')
  })

  it('gives the previous paragraph as context, not to translate, and keeps the text last', () => {
    const p = buildTranslationPrompt({ ...base, context: 'Deuxième paragraphe.' })
    expect(p).toContain('Do not translate it and do not include it in your answer')
    expect(p).toContain('<<<\nDeuxième paragraphe.\n>>>')
    expect(p.endsWith('\n\nTroisième paragraphe.')).toBe(true)
  })
})

describe('buildDocumentTranslationPrompt: form of address', () => {
  const base = { segments: 'a ||| b', segmentCount: 2, sourceLang: 'English', targetLang: 'French' }
  it('keeps the register of the original by default', () => {
    expect(buildDocumentTranslationPrompt(base)).toContain('Keep the register of the original')
  })
  it('applies the form of address chosen by the user', () => {
    expect(buildDocumentTranslationPrompt({ ...base, formality: 'Formal' })).toContain('Use the formal form of address in French')
    expect(buildDocumentTranslationPrompt({ ...base, formality: 'Informal' })).toContain('Use the informal form of address in French')
  })
})

describe('buildMarkdownTranslationPrompt: form of address and glossary (Extract & translate)', () => {
  it('passes the chosen form of address and the glossary, text still last', () => {
    const p = buildMarkdownTranslationPrompt({ sourceLang: 'English', targetLang: 'German', text: '## Hi', formality: 'Informal', glossaryClause: 'GLOSSARY\n' })
    expect(p).toContain('Use the informal form of address in German')
    expect(p).toContain('GLOSSARY')
    expect(p.endsWith('## Hi')).toBe(true)
  })
})

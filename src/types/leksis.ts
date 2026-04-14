export type Language = {
  code: string
  name: string
  baseCode?: string
}

export type Block =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; level: 1 | 2; text: string }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'page-break' }
  | { type: 'html'; content: string }

export type Formality = 'Formal' | 'Informal'

export type RewriteTone = string

export type ToneConfig = {
  id:          string
  labels:      { en: string; fr?: string; de?: string; it?: string }
  instruction: string
  enabled?:    boolean
}

export type RewriteLength = 'Shorter' | 'Keep' | 'Longer'

export type RewriteMode = 'rewrite' | 'correct'

export type GlossaryEntry = {
  id: number
  glossaryId: number
  source: string
  target: string
  sourceLang: string | null  // null = any language
  targetLang: string | null  // null = any language
}

export type Glossary = {
  id: number
  name: string
  description: string | null
  entryCount: number
  createdAt: string
}

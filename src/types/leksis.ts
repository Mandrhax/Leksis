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

export type RewriteTone = 'Professional' | 'Casual' | 'Friendly' | 'Authoritative' | 'Empathetic' | 'Creative'

export type RewriteLength = 'Shorter' | 'Keep' | 'Longer'

export type RewriteMode = 'rewrite' | 'correct'

export type GlossaryEntry = {
  source: string
  target: string
}

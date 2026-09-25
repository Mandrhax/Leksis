// Centralise tous les prompts envoyés à Ollama.
// Port de translator.js, rewrite-tab.js, doc-studio.js, image-tab.js

import type { Formality, RewriteLength } from '@/types/leksis'

// ── Traduction texte ────────────────────────────────────────────

type TranslationPromptOptions = {
  sourceLang: string
  sourceCode: string
  targetLang: string
  targetCode: string
  formality?: Formality | null
  glossaryClause?: string
  text: string
}

export function buildTranslationPrompt({
  sourceLang, sourceCode, targetLang, targetCode, formality, glossaryClause = '', text,
}: TranslationPromptOptions): string {
  const formalityLine = formality
    ? `Use the ${formality === 'Formal' ? 'formal' : 'informal'} form of address in ${targetLang} (e.g. ${
        formality === 'Formal'
          ? 'formal pronouns such as "vous" in French or "Sie" in German'
          : 'informal pronouns such as "tu" in French or "du" in German'
      }).\n`
    : ''

  return (
    `You are a professional ${sourceLang} (${sourceCode}) to ${targetLang} (${targetCode}) translator. ` +
    `Your goal is to accurately convey the meaning and nuances of the original ${sourceLang} text ` +
    `while adhering to ${targetLang} grammar, vocabulary, and cultural sensitivities.\n` +
    formalityLine +
    glossaryClause +
    `Produce only the ${targetLang} translation, without any additional explanations or commentary. ` +
    `Please translate the following ${sourceLang} text into ${targetLang}:\n\n${text}`
  )
}

// ── Traduction document (segments séparés par |||) ──────────────

type DocumentTranslationPromptOptions = {
  segments: string
  sourceLang: string
  targetLang: string
}

export function buildDocumentTranslationPrompt({
  segments, sourceLang, targetLang,
}: DocumentTranslationPromptOptions): string {
  return (
    `You are a professional ${sourceLang} to ${targetLang} translator. ` +
    `Translate the following text segments from ${sourceLang} to ${targetLang}. ` +
    `The segments are separated by ||| tokens. ` +
    `You MUST preserve every ||| token exactly as-is in your output — do not remove, merge, or add any. ` +
    `Translate each segment independently. Do not add any explanations.\n\n` +
    segments
  )
}

// ── OCR / Vision ────────────────────────────────────────────────

export function buildOcrPrompt(): string {
  return (
    `Extract all text visible in this image.\n` +
    `Return the result in clean Markdown format.\n` +
    `Rules:\n` +
    `- Use ## for main headings, ### for sub-headings\n` +
    `- Use - for list items\n` +
    `- Separate paragraphs with a blank line\n` +
    `- If the image contains a table, render it as a Markdown table: | col1 | col2 | with a separator row\n` +
    `- Do not add any commentary or description of the image itself\n` +
    `- Output only the extracted text, nothing else`
  )
}

// ── Traduction Markdown (post-OCR image / PDF scanné) ───────────

type MarkdownTranslationPromptOptions = {
  sourceLang: string
  targetLang: string
  text: string
}

export function buildMarkdownTranslationPrompt({ sourceLang, targetLang, text }: MarkdownTranslationPromptOptions): string {
  return (
    `Translate the following text from ${sourceLang} to ${targetLang}.\n` +
    `Return only the translated text in the same Markdown structure as the input.\n` +
    `Do not translate Markdown syntax (##, ###, **, -, |, etc.) — only translate the natural language content.\n\n` +
    text
  )
}

// ── Réécriture IA ───────────────────────────────────────────────

type RewritePromptOptions = {
  instruction: string
  length: RewriteLength
  langClause: string
  glossaryClause?: string
  text: string
}

export function buildRewritePrompt({
  instruction, length, langClause, glossaryClause = '', text,
}: RewritePromptOptions): { system: string; prompt: string } {
  const lengthInstruction =
    length === 'Shorter' ? 'Make the text significantly shorter while preserving the key message.' :
    length === 'Longer'  ? 'Expand the text with more detail and context.' :
    'Keep roughly the same length.'

  return {
    system:
      `You are an expert editor and writing coach. ` +
      `Your task is to rewrite text to match a specific tone while preserving the original meaning completely. ` +
      `Do not add new information. Do not remove key information. ` +
      `Return only the rewritten text, nothing else.`,
    prompt:
      `Rewrite the following text ${instruction}. ${lengthInstruction}\n` +
      `IMPORTANT: ${langClause}\n` +
      glossaryClause +
      `\n${text}`,
  }
}

type CorrectPromptOptions = {
  langClause: string
  glossaryClause?: string
  text: string
}

export function buildCorrectPrompt({ langClause, glossaryClause = '', text }: CorrectPromptOptions): { system: string; prompt: string } {
  return {
    system:
      `You are a precise proofreader. ` +
      `Your task is to correct spelling, grammar, and punctuation errors only. ` +
      `Do not rephrase, restructure, or change the style. ` +
      `Make the minimum number of changes necessary. ` +
      `Return only the corrected text, nothing else.`,
    prompt:
      `Correct all spelling, grammar, and punctuation errors in the following text.\n` +
      `IMPORTANT: ${langClause}\n` +
      glossaryClause +
      `\n${text}`,
  }
}

export function buildLangClause(langName: string): string {
  return `You MUST respond in ${langName} only — the same language as the input.`
}

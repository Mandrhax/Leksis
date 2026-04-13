// Limites par défaut (fallback si la DB n'est pas accessible)
export const TEXT_MAX_CHARS     = 5000
export const DOCUMENT_MAX_CHARS = 12000
export const IMAGE_MAX_BYTES    = 10 * 1024 * 1024 // 10 MB

export function validateTextInput(text: string, maxChars = TEXT_MAX_CHARS): string | null {
  if (!text || !text.trim()) return 'Text is required.'
  if (text.length > maxChars) return `Text exceeds the ${maxChars} character limit.`
  return null
}

export function validateDocumentInput(text: string, maxChars = DOCUMENT_MAX_CHARS): string | null {
  if (!text || !text.trim()) return 'Document is empty or could not be extracted.'
  if (text.length > maxChars) return `Document exceeds the ${maxChars} character limit.`
  return null
}

export function validateImageSize(bytes: number, maxBytes = IMAGE_MAX_BYTES): string | null {
  const maxMB = Math.round(maxBytes / (1024 * 1024))
  if (bytes > maxBytes) return `Image exceeds the ${maxMB} MB size limit.`
  return null
}

const SUPPORTED_DOC_EXTS = ['pdf', 'docx', 'doc', 'txt', 'csv'] as const

/** Returns the lowercase extension if valid, or null with the error message set. */
export function validateFileExtension(filename: string): { ext: string; error: null } | { ext: null; error: string } {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  if (!(SUPPORTED_DOC_EXTS as readonly string[]).includes(ext)) {
    return { ext: null, error: `Unsupported file type: .${ext}` }
  }
  return { ext, error: null }
}

// Limites par défaut (fallback si la DB n'est pas accessible)
export const TEXT_MAX_CHARS     = 5000
export const DOCUMENT_MAX_CHARS = 12000
export const IMAGE_MAX_BYTES    = 10 * 1024 * 1024 // 10 MB
export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024 // 10 MB — taille du fichier envoyé (PDF, DOCX…)
export const RATE_LIMIT_PER_MIN = 30               // appels IA / minute / utilisateur
export const OCR_MAX_PDF_PAGES  = 20               // pages d'un PDF scanné passées à l'OCR

export function validateTextInput(text: string, maxChars = TEXT_MAX_CHARS): string | null {
  if (!text || !text.trim()) return 'Text is required.'
  if (text.length > maxChars) return `Text exceeds the ${maxChars} character limit.`
  return null
}

export function validateImageSize(bytes: number, maxBytes = IMAGE_MAX_BYTES): string | null {
  const maxMB = Math.round(maxBytes / (1024 * 1024))
  if (bytes > maxBytes) return `Image exceeds the ${maxMB} MB size limit.`
  return null
}

export function validateDocumentSize(bytes: number, maxBytes = DOCUMENT_MAX_BYTES): string | null {
  const maxMB = Math.round(maxBytes / (1024 * 1024))
  if (bytes > maxBytes) return `File exceeds the ${maxMB} MB size limit.`
  return null
}

/**
 * true si l'en-tête Content-Length annonce déjà plus que `maxBytes` : on refuse (413) avant de lire
 * le corps, donc avant de le charger en mémoire. `overhead` couvre l'enveloppe multipart.
 */
export function requestTooLarge(req: Request, maxBytes: number, overhead = 64 * 1024): boolean {
  const declared = Number(req.headers.get('content-length'))
  return Number.isFinite(declared) && declared > maxBytes + overhead
}

// Noms de langue (« Chinese (Simplified) ») et codes BCP 47 : ces valeurs finissent dans les prompts,
// on n'accepte donc que des caractères de texte usuels.
const LANG_NAME_RE = /^[\p{L}\p{M}0-9 ()\-.,'’/]{1,64}$/u
const LANG_CODE_RE = /^[A-Za-z0-9-]{1,20}$/

export function isValidLangName(v: unknown): v is string {
  return typeof v === 'string' && LANG_NAME_RE.test(v)
}

export function isValidLangCode(v: unknown): v is string {
  return typeof v === 'string' && LANG_CODE_RE.test(v)
}

const SUPPORTED_DOC_EXTS = ['pdf', 'docx', 'txt', 'csv'] as const

/** Returns the lowercase extension if valid, or null with the error message set. */
export function validateFileExtension(filename: string): { ext: string; error: null } | { ext: null; error: string } {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  if (!(SUPPORTED_DOC_EXTS as readonly string[]).includes(ext)) {
    return { ext: null, error: `Unsupported file type: .${ext}` }
  }
  return { ext, error: null }
}

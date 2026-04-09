import 'server-only'
import { TEXT_MAX_CHARS, DOCUMENT_MAX_CHARS, IMAGE_MAX_BYTES } from '@/lib/validators'

/**
 * Lit les limites configurables depuis la DB.
 * Server-only — retourne les defaults si la DB est inaccessible.
 */
export async function getDynamicLimits(): Promise<{ maxTextChars: number; maxDocChars: number; maxImageBytes: number }> {
  try {
    const { getSetting } = await import('@/lib/settings')
    const cfg = await getSetting<{
      limits?: { maxTextChars?: number; maxDocChars?: number; maxImageMB?: number }
    }>('features')
    const limits = cfg?.limits ?? {}
    return {
      maxTextChars:  limits.maxTextChars ?? TEXT_MAX_CHARS,
      maxDocChars:   limits.maxDocChars  ?? DOCUMENT_MAX_CHARS,
      maxImageBytes: (limits.maxImageMB ?? 10) * 1024 * 1024,
    }
  } catch {
    return { maxTextChars: TEXT_MAX_CHARS, maxDocChars: DOCUMENT_MAX_CHARS, maxImageBytes: IMAGE_MAX_BYTES }
  }
}

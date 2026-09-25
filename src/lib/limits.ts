import 'server-only'
import { TEXT_MAX_CHARS, DOCUMENT_MAX_CHARS, IMAGE_MAX_BYTES, RATE_LIMIT_PER_MIN } from '@/lib/validators'

export interface DynamicLimits {
  maxTextChars:    number
  maxDocChars:     number
  maxImageBytes:   number
  /** Appels IA par minute et par utilisateur (0 = illimité) */
  rateLimitPerMin: number
}

/**
 * Lit les limites configurables depuis la DB.
 * Server-only — retourne les defaults si la DB est inaccessible.
 */
export async function getDynamicLimits(): Promise<DynamicLimits> {
  try {
    const { getSetting } = await import('@/lib/settings')
    const cfg = await getSetting<{
      limits?: { maxTextChars?: number; maxDocChars?: number; maxImageMB?: number; rateLimitPerMin?: number }
    }>('features')
    const limits = cfg?.limits ?? {}
    return {
      maxTextChars:    limits.maxTextChars ?? TEXT_MAX_CHARS,
      maxDocChars:     limits.maxDocChars  ?? DOCUMENT_MAX_CHARS,
      maxImageBytes:   limits.maxImageMB ? limits.maxImageMB * 1024 * 1024 : IMAGE_MAX_BYTES,
      rateLimitPerMin: typeof limits.rateLimitPerMin === 'number' ? limits.rateLimitPerMin : RATE_LIMIT_PER_MIN,
    }
  } catch {
    return {
      maxTextChars:    TEXT_MAX_CHARS,
      maxDocChars:     DOCUMENT_MAX_CHARS,
      maxImageBytes:   IMAGE_MAX_BYTES,
      rateLimitPerMin: RATE_LIMIT_PER_MIN,
    }
  }
}

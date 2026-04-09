import 'server-only'
import { query } from '@/lib/db'

export interface UsageEntry {
  userId?:    string
  userEmail:  string
  feature:    'text' | 'document' | 'image' | 'rewrite'
  sourceLang?: string
  targetLang?: string
  model?:      string
  charCount?:  number
}

/**
 * Enregistre un appel IA réussi dans usage_log.
 * Fire-and-forget — ne bloque pas la réponse.
 */
export function logUsage(entry: UsageEntry): void {
  query(
    `INSERT INTO usage_log (user_id, user_email, feature, source_lang, target_lang, model, char_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      entry.userId    ?? null,
      entry.userEmail,
      entry.feature,
      entry.sourceLang ?? null,
      entry.targetLang ?? null,
      entry.model      ?? null,
      entry.charCount  ?? null,
    ]
  ).catch(() => { /* fire-and-forget : ne jamais bloquer la réponse */ })
}

import 'server-only'
import { query } from '@/lib/db'
import { LANGUAGES } from '@/lib/languages'
import type { UsageStatus, UsageTrigger } from '@/lib/usage-schema'

export interface UsageEntry {
  userId?:    string
  userEmail:  string
  feature:    'text' | 'document' | 'image' | 'rewrite'
  sourceLang?: string
  targetLang?: string
  model?:      string
  charCount?:  number
  /** Ce qui a déclenché l'appel (onglet Texte seulement) */
  trigger?:    UsageTrigger
  status?:     UsageStatus
  /** Caractères réellement envoyés au modèle (0 sur un cache_hit, moins que charCount avec les segments) */
  modelChars?: number
  latencyMs?:  number
  /** Identifiant commun aux requêtes successives d'une même saisie (fourni par le client) */
  requestGroupId?: string
}

/** Valeur explicite quand la langue n'a pas de sens pour la fonction (OCR, cible d'une réécriture…) */
export const NO_LANG = 'n/a'

/**
 * Code BCP 47 pour le journal : accepte un code (`fr-CH`), un nom (`French`, ancien format de rewrite/document)
 * ou rien (`n/a`). Une valeur inconnue est gardée telle quelle plutôt que perdue.
 */
export function normalizeUsageLang(value: string | null | undefined): string {
  const v = value?.trim()
  if (!v) return NO_LANG
  if (v.toLowerCase() === 'auto' || v.toLowerCase() === 'unknown') return 'auto'
  const byCode = LANGUAGES.find(l => l.code.toLowerCase() === v.toLowerCase())
  if (byCode) return byCode.code
  const byName = LANGUAGES.find(l => l.name.toLowerCase() === v.toLowerCase())
  return byName ? byName.code : v
}

/**
 * Enregistre un appel IA dans usage_log.
 * Fire-and-forget — ne bloque pas la réponse.
 */
export function logUsage(entry: UsageEntry): void {
  query(
    `INSERT INTO usage_log (user_id, user_email, feature, source_lang, target_lang, model, char_count,
                            trigger_type, status, model_chars, latency_ms, request_group_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      entry.userId    ?? null,
      entry.userEmail,
      entry.feature,
      normalizeUsageLang(entry.sourceLang),
      normalizeUsageLang(entry.targetLang),
      entry.model      ?? null,
      entry.charCount  ?? null,
      entry.trigger    ?? null,
      entry.status     ?? 'completed',
      entry.modelChars ?? null,
      entry.latencyMs  ?? null,
      entry.requestGroupId ?? null,
    ]
  ).catch(err => console.error('[usage] log failed:', err)) // ne jamais bloquer la réponse
}

function isAbortError(err: unknown): boolean {
  return (err as { name?: string })?.name === 'AbortError'
}

/**
 * Enveloppe le flux de réponse et n'écrit la ligne d'usage qu'à la fin, avec son vrai statut :
 * `completed` (flux terminé), `cancelled` (le client a coupé — nouvelle frappe, onglet fermé) ou `error`.
 * `entry` est lu à la fin : l'appelant peut encore y compléter `modelChars` pendant le flux.
 */
export function trackUsageStream(
  stream: ReadableStream<Uint8Array>,
  entry: UsageEntry,
  startedAt = Date.now(),
  log: (e: UsageEntry) => void = logUsage,
): ReadableStream<Uint8Array> {
  const reader = stream.getReader()
  let logged = false
  const finish = (status: UsageStatus) => {
    if (logged) return
    logged = true
    log({ ...entry, status: entry.status ?? status, latencyMs: Date.now() - startedAt })
  }

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read()
        if (done) { controller.close(); finish('completed'); return }
        controller.enqueue(value)
      } catch (err) {
        finish(isAbortError(err) ? 'cancelled' : 'error')
        controller.error(err)
      }
    },
    cancel(reason) {
      finish('cancelled')
      return reader.cancel(reason)
    },
  })
}

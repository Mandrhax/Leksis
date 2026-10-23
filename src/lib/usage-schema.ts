import { z } from 'zod'

// Client-safe : valeurs du journal d'usage que le navigateur envoie avec une traduction.

export const USAGE_TRIGGERS = ['typing', 'paste', 'button', 'lang_change', 'auto_detect'] as const
export type UsageTrigger = typeof USAGE_TRIGGERS[number]

export const USAGE_STATUSES = ['completed', 'cancelled', 'cache_hit', 'skipped', 'error'] as const
export type UsageStatus = typeof USAGE_STATUSES[number]

/** Champs de suivi optionnels : une valeur invalide est ignorée, jamais une raison de refuser la traduction */
export const UsageTrackingSchema = z.object({
  trigger:        z.enum(USAGE_TRIGGERS).optional().catch(undefined),
  requestGroupId: z.string().regex(/^[A-Za-z0-9-]{1,64}$/).optional().catch(undefined),
})

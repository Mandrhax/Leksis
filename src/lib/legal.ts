import 'server-only'
import { getSetting } from '@/lib/settings'
import { getAiConfig, isExternalUrl } from '@/lib/llm'
import { aiModeOf } from '@/lib/llm/types'
import { RETENTION_DEFAULTS, SETTING_DEFAULTS } from '@/lib/settings-schema'
import type { AiScope, LegalContext } from '@/lib/legal-content'

async function safeSetting(key: string): Promise<Record<string, unknown>> {
  try { return await getSetting<Record<string, unknown>>(key) } catch { return {} } // base injoignable : valeurs par défaut
}

/**
 * Où partent les textes. Un serveur hors réseau privé n'est utilisé que si l'admin l'a autorisé (allowExternal) ;
 * sinon ses requêtes sont refusées et rien ne quitte le réseau. En cas de doute (DNS), on annonce « external ».
 */
async function resolveAiScope(): Promise<AiScope> {
  try {
    const cfg = await getAiConfig()
    if (aiModeOf(cfg.provider, cfg.baseUrl) === 'ollama-local') return 'local'
    if (!cfg.allowExternal) return 'private'
    return (await isExternalUrl(cfg.baseUrl)) ? 'external' : 'private'
  } catch {
    return 'external'
  }
}

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v.trim() : fallback)
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)

/** Configuration réelle de l'installation, telle que lue par les pages /legal/* (publiques, sans donnée sensible). */
export async function loadLegalContext(): Promise<LegalContext> {
  const [branding, general, legal, features, aiScope] = await Promise.all([
    safeSetting('branding'), safeSetting('general'), safeSetting('legal'), safeSetting('features'), resolveAiScope(),
  ])
  const tabs   = (features.tabs   ?? {}) as Record<string, unknown>
  const limits = (features.limits ?? {}) as Record<string, unknown>
  const dl     = SETTING_DEFAULTS.features.limits

  return {
    siteName:           str(branding.siteName, SETTING_DEFAULTS.branding.siteName) || SETTING_DEFAULTS.branding.siteName,
    organization:       str(legal.organization),
    contact:            str(legal.contact) || str(general.contactEmail),
    privacyNotes:       str(legal.privacyNotes),
    usageRules:         str(legal.usageRules),
    usageRetentionDays: num(general.usageRetentionDays, RETENTION_DEFAULTS.usageRetentionDays),
    auditRetentionDays: num(general.auditRetentionDays, RETENTION_DEFAULTS.auditRetentionDays),
    aiScope,
    features: {
      text:     tabs.text     !== false,
      document: tabs.document !== false,
      image:    tabs.image    !== false,
      rewrite:  tabs.rewrite  !== false,
    },
    limits: {
      maxTextChars:    num(limits.maxTextChars, dl.maxTextChars),
      maxDocChars:     num(limits.maxDocChars, dl.maxDocChars),
      maxImageMB:      num(limits.maxImageMB, dl.maxImageMB),
      rateLimitPerMin: num(limits.rateLimitPerMin, dl.rateLimitPerMin),
    },
  }
}

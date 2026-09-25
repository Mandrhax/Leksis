import 'server-only'
import { getSetting } from '@/lib/settings'

type FeatureKey = 'text' | 'document' | 'image' | 'rewrite'

/**
 * Retourne true si le module est activé (ou si la clé features n'existe pas en DB).
 * Fallback permissif : on laisse passer si la config est absente.
 */
export async function isFeatureEnabled(feature: FeatureKey): Promise<boolean> {
  try {
    const cfg = await getSetting<{ tabs?: Record<string, boolean> }>('features')
    if (!cfg || !cfg.tabs) return true
    const val = cfg.tabs[feature]
    return val !== false
  } catch {
    return true
  }
}

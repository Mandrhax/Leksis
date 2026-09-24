import 'server-only'
import { getSetting } from '@/lib/settings'
import { getAiConfig } from '@/lib/llm'

type FeatureKey = 'text' | 'document' | 'image' | 'rewrite'

/**
 * Retourne true si le module est activé (ou si la clé features n'existe pas en DB).
 * Fallback permissif : on laisse passer si la config est absente.
 *
 * Document et image sont forcés désactivés avec le provider vLLM : les modèles à
 * prompt délimité (TranslateGemma) n'exposent pas la vision au format OpenAI
 * générique via vLLM (voir isDelimitedModel dans prompts.ts) — plutôt que
 * d'exposer une fonctionnalité qui échoue en boucle (502), on la masque.
 */
export async function isFeatureEnabled(feature: FeatureKey): Promise<boolean> {
  if (feature === 'document' || feature === 'image') {
    try {
      if ((await getAiConfig()).provider === 'vllm') return false
    } catch { /* config IA indisponible : on continue sur le réglage features */ }
  }
  try {
    const cfg = await getSetting<{ tabs?: Record<string, boolean> }>('features')
    if (!cfg || !cfg.tabs) return true
    const val = cfg.tabs[feature]
    return val !== false
  } catch {
    return true
  }
}

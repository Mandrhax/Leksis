import 'server-only'
import type { ToneConfig } from '@/types/leksis'
import { getSetting } from '@/lib/settings'
import { DEFAULT_TONES, normalizeTones } from '@/lib/tones-defaults'

export { DEFAULT_TONES }

export async function getConfiguredTones(): Promise<ToneConfig[]> {
  try {
    return normalizeTones(await getSetting('rewrite_tones'))
  } catch { /* base injoignable : tons par défaut */ }
  return DEFAULT_TONES
}

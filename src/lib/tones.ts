import 'server-only'
import type { ToneConfig } from '@/types/leksis'
import { getSetting } from '@/lib/settings'

export const DEFAULT_TONES: ToneConfig[] = [
  { id: 'professional',  labels: { en: 'Professional',  fr: 'Professionnel', de: 'Professionell'  }, instruction: 'in a professional, formal tone appropriate for business communication' },
  { id: 'casual',        labels: { en: 'Casual',         fr: 'Décontracté',   de: 'Locker'         }, instruction: 'in a casual, relaxed tone as if talking to a friend' },
  { id: 'friendly',      labels: { en: 'Friendly',       fr: 'Amical',        de: 'Freundlich'     }, instruction: 'in a warm and friendly tone that feels approachable and welcoming' },
  { id: 'authoritative', labels: { en: 'Authoritative',  fr: 'Autoritaire',   de: 'Autoritativ'    }, instruction: 'in an authoritative, confident tone that conveys expertise and credibility' },
  { id: 'empathetic',    labels: { en: 'Empathetic',     fr: 'Empathique',    de: 'Einfühlsam'     }, instruction: 'in an empathetic, compassionate tone that acknowledges feelings and builds connection' },
  { id: 'creative',      labels: { en: 'Creative',       fr: 'Créatif',       de: 'Kreativ'        }, instruction: 'in a creative, expressive tone that uses vivid language and original phrasing' },
]

function migrateLabel(t: unknown): ToneConfig {
  const tone = t as Record<string, unknown>
  if ('label' in tone && !('labels' in tone)) {
    const { label, ...rest } = tone
    return { ...(rest as Omit<ToneConfig, 'labels'>), labels: { en: label as string } }
  }
  return tone as ToneConfig
}

export async function getConfiguredTones(): Promise<ToneConfig[]> {
  try {
    const raw = await getSetting('rewrite_tones')
    if (Array.isArray(raw) && raw.length > 0) return raw.map(migrateLabel)
  } catch { /* fall through */ }
  return DEFAULT_TONES
}

import 'server-only'
import type { ToneConfig } from '@/types/leksis'
import { getSetting } from '@/lib/settings'

export const DEFAULT_TONES: ToneConfig[] = [
  { id: 'professional',  label: 'Professional',  instruction: 'in a professional, formal tone appropriate for business communication' },
  { id: 'casual',        label: 'Casual',        instruction: 'in a casual, relaxed tone as if talking to a friend' },
  { id: 'friendly',      label: 'Friendly',      instruction: 'in a warm and friendly tone that feels approachable and welcoming' },
  { id: 'authoritative', label: 'Authoritative', instruction: 'in an authoritative, confident tone that conveys expertise and credibility' },
  { id: 'empathetic',    label: 'Empathetic',    instruction: 'in an empathetic, compassionate tone that acknowledges feelings and builds connection' },
  { id: 'creative',      label: 'Creative',      instruction: 'in a creative, expressive tone that uses vivid language and original phrasing' },
]

export async function getConfiguredTones(): Promise<ToneConfig[]> {
  try {
    const raw = await getSetting('rewrite_tones')
    if (Array.isArray(raw) && raw.length > 0) return raw as ToneConfig[]
  } catch { /* fall through */ }
  return DEFAULT_TONES
}

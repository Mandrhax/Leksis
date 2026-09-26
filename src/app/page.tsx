import { HomeClient } from '@/components/ui/HomeClient'
import type { Formality } from '@/types/leksis'
import { DEFAULT_TONES, normalizeTones } from '@/lib/tones-defaults'

export const dynamic = 'force-dynamic'

async function loadPageSettings() {
  try {
    const { getAllSettings } = await import('@/lib/settings')
    const settings = await getAllSettings()
    const branding  = (settings.branding  ?? {}) as { logoUrl?: string; siteName?: string; headerLogoSize?: string }
    const design    = (settings.design    ?? {}) as {
      headerLogoSize?:   string
      footerText?:       string
      footerTextColor?:  string
      footerLinks?:      { label: string; url: string }[]
    }
    const features  = (settings.features  ?? {}) as {
      tabs?:             { text?: boolean; document?: boolean; image?: boolean; rewrite?: boolean }
      defaults?:         { sourceLang?: string; targetLang?: string; formality?: Formality }
      limits?:           { maxTextChars?: number; maxDocChars?: number; maxImageMB?: number }
    }

    const tabs = {
      text:     features.tabs?.text     !== false,
      document: features.tabs?.document !== false,
      image:    features.tabs?.image    !== false,
      rewrite:  features.tabs?.rewrite  !== false,
    }

    const configuredTones = normalizeTones(settings.rewrite_tones)

    return {
      logoUrl:           branding.logoUrl  ?? null,
      // headerLogoSize moved from `design` to `branding` — fall back to the old key for installs that haven't re-saved yet
      logoSize:          parseInt(branding.headerLogoSize ?? design.headerLogoSize ?? '32', 10),
      siteName:          branding.siteName ?? 'Leksis',
      footerText:        design.footerText      ?? '',
      footerTextColor:   design.footerTextColor ?? '',
      footerLinks:       design.footerLinks     ?? [],
      enabledTabs:       tabs,
      defaultSourceLang: features.defaults?.sourceLang ?? 'auto',
      defaultTargetLang: features.defaults?.targetLang ?? 'en',
      defaultFormality:  features.defaults?.formality  ?? 'Informal',
      maxTextChars:      features.limits?.maxTextChars  ?? 5000,
      configuredTones,
    }
  } catch {
    return {
      logoUrl:           null,
      logoSize:          32,
      siteName:          'Leksis',
      footerText:        '',
      footerTextColor:   '',
      footerLinks:       [],
      enabledTabs:       { text: true, document: true, image: true, rewrite: true },
      defaultSourceLang: 'auto',
      defaultTargetLang: 'en',
      defaultFormality:  'Informal' as Formality,
      maxTextChars:      5000,
      configuredTones:   DEFAULT_TONES,
    }
  }
}

export default async function Home() {
  const props = await loadPageSettings()
  return <HomeClient {...props} />
}

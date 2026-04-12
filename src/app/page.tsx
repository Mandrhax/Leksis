import { HomeClient } from '@/components/ui/HomeClient'
import type { ToneConfig } from '@/types/leksis'
import { DEFAULT_TONES } from '@/lib/tones'

export const dynamic = 'force-dynamic'

async function loadPageSettings() {
  try {
    const { getAllSettings } = await import('@/lib/settings')
    const settings = await getAllSettings()
    const branding  = (settings.branding  ?? {}) as { logoUrl?: string; siteName?: string }
    const design    = (settings.design    ?? {}) as {
      headerLogoSize?: string
      footerText?:     string
      footerLinks?:    { label: string; url: string }[]
    }
    const features  = (settings.features  ?? {}) as {
      tabs?:     { text?: boolean; document?: boolean; image?: boolean; rewrite?: boolean }
      defaults?: { sourceLang?: string; targetLang?: string }
      limits?:   { maxTextChars?: number; maxDocChars?: number; maxImageMB?: number }
    }

    const tabs = {
      text:     features.tabs?.text     !== false,
      document: features.tabs?.document !== false,
      image:    features.tabs?.image    !== false,
      rewrite:  features.tabs?.rewrite  !== false,
    }

    const rawTones = settings.rewrite_tones
    const configuredTones: ToneConfig[] = Array.isArray(rawTones) && rawTones.length > 0
      ? (rawTones as ToneConfig[])
      : DEFAULT_TONES

    return {
      logoUrl:           branding.logoUrl  ?? null,
      logoSize:          parseInt(design.headerLogoSize ?? '32', 10),
      siteName:          branding.siteName ?? 'Leksis',
      footerText:        design.footerText  ?? '',
      footerLinks:       design.footerLinks ?? [],
      enabledTabs:       tabs,
      defaultSourceLang: features.defaults?.sourceLang ?? 'auto',
      defaultTargetLang: features.defaults?.targetLang ?? 'en',
      maxTextChars:      features.limits?.maxTextChars  ?? 5000,
      configuredTones,
    }
  } catch {
    return {
      logoUrl:           null,
      logoSize:          32,
      siteName:          'Leksis',
      footerText:        '',
      footerLinks:       [],
      enabledTabs:       { text: true, document: true, image: true, rewrite: true },
      defaultSourceLang: 'auto',
      defaultTargetLang: 'en',
      maxTextChars:      5000,
      configuredTones:   DEFAULT_TONES,
    }
  }
}

export default async function Home() {
  const props = await loadPageSettings()
  return <HomeClient {...props} />
}

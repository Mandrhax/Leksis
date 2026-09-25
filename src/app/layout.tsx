export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { Inter, Manrope } from 'next/font/google'
import { SessionProvider } from 'next-auth/react'
import 'bootstrap-icons/font/bootstrap-icons.css'
import { auth } from '@/auth'
import { GlobalBanner } from '@/components/GlobalBanner'
import { MaintenanceScreen } from '@/components/MaintenanceScreen'
import { buildColorVars } from '@/lib/color-utils'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  display: 'swap',
})

// ── Helpers pour lire les réglages sans bloquer si la DB est indisponible ────

type BrandingSettings = {
  siteName?:         string
  primaryColor?:     string
  secondaryColor?:   string
  logoUrl?:          string
  backgroundColor?:  string
  backgroundImage?:  string
}
type DesignSettings = {
  buttonRadius?: string
}
type GeneralSettings = {
  globalBanner?: string
  maintenanceMode?: boolean
  maintenanceMessage?: string
}

async function loadSettings() {
  try {
    // Import dynamique pour éviter que l'import côté client ne soit inclus
    const { getAllSettings } = await import('@/lib/settings')
    return await getAllSettings()
  } catch {
    return {}
  }
}

// ── Métadonnées dynamiques ────────────────────────────────────────────────────

export async function generateMetadata(): Promise<Metadata> {
  const settings = await loadSettings()
  const branding = (settings.branding ?? {}) as BrandingSettings

  return {
    title: branding.siteName || 'Leksis',
    icons: { icon: branding.logoUrl || '/favicon.svg' },
  }
}

// ── Layout principal ──────────────────────────────────────────────────────────

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [settings, session] = await Promise.all([loadSettings(), auth()])

  const branding = (settings.branding ?? {}) as BrandingSettings
  const design   = (settings.design   ?? {}) as DesignSettings
  const general  = (settings.general  ?? {}) as GeneralSettings

  // ── Couleurs ────────────────────────────────────────────────────────────────
  const primary   = branding.primaryColor   || '#565e74'
  const secondary = branding.secondaryColor || '#506076'
  const colorVars = buildColorVars(primary, secondary)

  // ── Rayon des boutons ────────────────────────────────────────────────────────
  colorVars['--radius-full'] = design.buttonRadius || '0.75rem'

  // ── CSS vars → string pour <style> tag ─────────────────────────────────────
  const cssVarsString = Object.entries(colorVars)
    .map(([k, v]) => `${k}:${v}`)
    .join(';')

  // ── Mode sombre ──────────────────────────────────────────────────────────────
  const htmlClass = `light ${inter.variable} ${manrope.variable}`

  // ── Mode maintenance ─────────────────────────────────────────────────────────
  const isAdmin       = session?.user?.role === 'admin'
  const inMaintenance = general.maintenanceMode && !isAdmin

  return (
    <html lang="en" className={htmlClass} suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{ __html: `:root{${cssVarsString}}` }} />
        {/* Material Symbols + Bootstrap Icons : self-hébergés (next/font + npm) — pas de CDN tiers */}
      </head>
      <body
        className="antialiased font-body selection:bg-primary-container bg-background text-on-background min-h-screen"
        style={{
          ...(branding.backgroundColor ? { backgroundColor: branding.backgroundColor } : {}),
          ...(branding.backgroundImage ? {
            backgroundImage:      `url('${branding.backgroundImage}')`,
            backgroundSize:       'cover',
            backgroundPosition:   'center',
            backgroundAttachment: 'fixed',
          } : {}),
        }}
      >
        {/* Bannière globale */}
        {general.globalBanner && !inMaintenance && (
          <GlobalBanner message={general.globalBanner} />
        )}

        <SessionProvider>
          {inMaintenance ? (
            <MaintenanceScreen message={general.maintenanceMessage} />
          ) : (
            children
          )}
        </SessionProvider>
      </body>
    </html>
  )
}

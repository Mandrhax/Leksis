export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { Inter, Manrope } from 'next/font/google'
import { SessionProvider } from 'next-auth/react'
import { auth } from '@/auth'
import { GlobalBanner } from '@/components/GlobalBanner'
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
  darkMode?:         boolean
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
  const htmlClass = `${branding.darkMode ? 'dark' : 'light'} ${inter.variable} ${manrope.variable}`

  // ── Mode maintenance ─────────────────────────────────────────────────────────
  const isAdmin       = session?.user?.role === 'admin'
  const inMaintenance = general.maintenanceMode && !isAdmin

  return (
    <html lang="fr" className={htmlClass} suppressHydrationWarning>
      <head>
        {/* Anti-flash : lit localStorage avant le premier paint pour éviter le scintillement */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var d=localStorage.getItem('leksisDarkMode');if(d!==null){var e=document.documentElement;if(d==='true'){e.classList.add('dark');e.classList.remove('light');}else{e.classList.remove('dark');e.classList.add('light');}}}catch(ex){}})();` }} />
        <style dangerouslySetInnerHTML={{ __html: `:root{${cssVarsString}}` }} />
        {/* Material Symbols (icons) */}
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
        {/* Bootstrap Icons (file type icons in Document Studio) */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css"
        />
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
            /* Page maintenance pour les visiteurs non-admin */
            <div className="min-h-screen flex items-center justify-center bg-background text-on-background px-6">
              <div className="text-center max-w-md space-y-4">
                <span className="material-symbols-outlined text-5xl text-on-surface-variant" aria-hidden="true">
                  engineering
                </span>
                <h1 className="font-headline font-bold text-2xl text-on-surface">Maintenance en cours</h1>
                <p className="text-sm text-on-surface-variant leading-relaxed">
                  {general.maintenanceMessage?.trim() || 'Le site est temporairement en maintenance. Merci de réessayer plus tard.'}
                </p>
              </div>
            </div>
          ) : (
            children
          )}
        </SessionProvider>
      </body>
    </html>
  )
}

'use client'

import { useState } from 'react'
import { TextTranslationTab }   from '@/components/tabs/TextTranslationTab'
import { DocumentStudioTab }    from '@/components/tabs/DocumentStudioTab'
import { ImageExtractionTab }   from '@/components/tabs/ImageExtractionTab'
import { AIRewriteTab }         from '@/components/tabs/AIRewriteTab'
import { AccountMenu }          from '@/components/ui/AccountMenu'
import { UILanguageSwitcher }   from '@/components/ui/UILanguageSwitcher'
import { HelpModal }            from '@/components/ui/HelpModal'
import { I18nProvider, useI18n } from '@/lib/i18n'
import { FR_QUOTES } from '@/lib/fr-quotes'
import type { ToneConfig } from '@/types/leksis'

type TabId = 'text' | 'document' | 'image' | 'rewrite'

interface EnabledTabs {
  text:     boolean
  document: boolean
  image:    boolean
  rewrite:  boolean
}

interface Props {
  logoUrl:           string | null
  logoSize:          number
  siteName:          string
  footerText:        string
  footerTextColor:   string
  footerLinks:       { label: string; url: string }[]
  enabledTabs:       EnabledTabs
  defaultSourceLang: string
  defaultTargetLang: string
  maxTextChars:      number
  configuredTones:   ToneConfig[]
}

export function HomeClient(props: Props) {
  return (
    <I18nProvider>
      <HomeWorkspace {...props} />
    </I18nProvider>
  )
}

function HomeWorkspace({ logoUrl, logoSize, siteName, footerText, footerTextColor, footerLinks, enabledTabs, defaultSourceLang, defaultTargetLang, maxTextChars, configuredTones }: Props) {
  const { t, locale } = useI18n()

  const ALL_TABS: { id: TabId; label: string; icon: string }[] = [
    { id: 'text',     label: t.home.tabText,     icon: 'translate'     },
    { id: 'document', label: t.home.tabDocument, icon: 'description'   },
    { id: 'image',    label: t.home.tabImage,    icon: 'image_search'  },
    { id: 'rewrite',  label: t.home.tabRewrite,  icon: 'auto_fix_high' },
  ]

  const visibleTabs = ALL_TABS.filter(tab => enabledTabs[tab.id])

  const [activeTab, setActiveTab] = useState<TabId>(() => visibleTabs[0]?.id ?? 'text')
  const [logoVisible, setLogoVisible] = useState(true)
  const [helpOpen, setHelpOpen] = useState(false)
  const [randomQuote] = useState(() => FR_QUOTES[Math.floor(Math.random() * FR_QUOTES.length)])

  // Si l'onglet actif est désactivé (rechargement dynamique), revenir au premier
  const safeActiveTab = enabledTabs[activeTab] ? activeTab : (visibleTabs[0]?.id ?? 'text')

  return (
    <div className="min-h-screen flex flex-col">

      {/* ── Tab bar ── */}
      <div className="relative border-b border-outline-variant/10">

        {/* Logo — absolute left */}
        {logoUrl && logoVisible && (
          <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoUrl}
              alt={siteName}
              height={logoSize}
              style={{ height: `${logoSize}px`, width: 'auto', maxWidth: '160px' }}
              onError={() => setLogoVisible(false)}
            />
          </div>
        )}

        {/* Tabs — centred */}
        <div className="flex justify-center gap-2 sm:gap-8 px-6 md:px-8" role="tablist" aria-label={t.home.tabsAriaLabel}>
          {visibleTabs.map(tab => (
            <button
              key={tab.id}
              id={`${tab.id}TabBtn`}
              role="tab"
              type="button"
              aria-selected={safeActiveTab === tab.id}
              aria-controls={`${tab.id}Tab`}
              onClick={() => setActiveTab(tab.id)}
              className={`tab-btn py-3 px-3 sm:px-1 text-sm font-medium border-b-2 transition-all ${
                safeActiveTab === tab.id
                  ? 'text-on-surface border-primary'
                  : 'text-on-surface-variant border-transparent hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined align-middle sm:mr-1.5 text-lg" aria-hidden="true">{tab.icon}</span>
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Right controls: help + UI language switcher + account menu */}
        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1">
          <button
            className="icon-btn"
            onClick={() => setHelpOpen(true)}
            aria-label={t.helpModal.title}
          >
            <span className="material-symbols-outlined">help</span>
          </button>
          <UILanguageSwitcher />
          <AccountMenu />
        </div>
      </div>

      {/* ── Main workspace ── */}
      <main className="flex-grow flex flex-col items-center px-6 md:px-8 pb-6 pt-6">
        <div className="w-full max-w-[1440px]">
          {safeActiveTab === 'text'     && <TextTranslationTab defaultSourceLang={defaultSourceLang} defaultTargetLang={defaultTargetLang} maxTextChars={maxTextChars} />}
          {safeActiveTab === 'document' && <DocumentStudioTab  defaultSourceLang={defaultSourceLang} defaultTargetLang={defaultTargetLang} />}
          {safeActiveTab === 'image'    && <ImageExtractionTab defaultTargetLang={defaultTargetLang} />}
          {safeActiveTab === 'rewrite'  && <AIRewriteTab maxTextChars={maxTextChars} configuredTones={configuredTones} />}
        </div>
      </main>

      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} activeTab={safeActiveTab} />

      {/* ── Footer ── */}
      {(footerText || footerLinks.length > 0 || locale === 'fr') && (
        <footer className="border-t border-outline-variant/10 px-6 md:px-8 py-4">
          <div className="flex flex-wrap items-center gap-3">
            {locale === 'fr' && (
              <p className="w-full text-center text-xs italic text-on-surface-variant/60">
                {randomQuote}
              </p>
            )}
            {footerText && (
              <span
                className="text-xs text-on-surface-variant"
                style={footerTextColor ? { color: footerTextColor } : undefined}
              >
                {footerText}
              </span>
            )}
            {footerLinks.length > 0 && (
              <nav className="flex items-center gap-4 ml-auto">
                {footerLinks.map((link, i) => (
                  <a
                    key={i}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-on-surface-variant hover:text-on-surface transition-colors"
                    style={footerTextColor ? { color: footerTextColor } : undefined}
                  >
                    {link.label}
                  </a>
                ))}
              </nav>
            )}
          </div>
        </footer>
      )}

    </div>
  )
}

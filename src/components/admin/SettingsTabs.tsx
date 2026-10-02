'use client'

import { useEffect, useMemo, useState } from 'react'
import { BrandingForm }  from './BrandingForm'
import { DesignForm }    from './DesignForm'
import { GeneralForm }   from './GeneralForm'
import { SmtpForm }      from './SmtpForm'
import { FeaturesForm }  from './FeaturesForm'
import { TonesForm }     from './TonesForm'
import { LegalForm }     from './LegalForm'
import { ConnexionForm } from './ConnexionForm'
import { OidcForm }      from './OidcForm'
import type { ToneConfig } from '@/types/leksis'
import type { SmtpPublicConfig } from '@/lib/smtp'
import type { OidcPublicConfig, AuthMethod } from '@/lib/auth-methods'
import { AdminToast }    from './AdminToast'
import type { ToastState } from './AdminToast'
import { useI18n } from '@/lib/i18n'
import { ServiceTabBar } from './ServiceTabBar'
import { useAdminDirtyRegister } from '@/lib/admin-dirty'

interface Props {
  settings: Record<string, unknown>
  smtp: SmtpPublicConfig
  oidc: OidcPublicConfig
  authMethod: AuthMethod
  allowedDomains: string
  inviteOnly: boolean
}

type Tab = 'identity' | 'appearance' | 'features' | 'tones' | 'general' | 'legal' | 'connexion'

// Finer-grained than Tab: the Connexion tab hosts three independently-saved forms.
type DirtySource = 'identity' | 'appearance' | 'features' | 'tones' | 'general' | 'connexion' | 'smtp' | 'oidc' | 'legal'

export function SettingsTabs({ settings, smtp, oidc, authMethod, allowedDomains, inviteOnly }: Props) {
  const { t } = useI18n()
  const st = t.settingsTabs
  const [tab, setTab]               = useState<Tab>('identity')

  // Lien direct (?tab=connexion), lu après le montage : même raison que callbackUrl (pas de useSearchParams)
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get('tab')
    if (wanted && (['identity', 'appearance', 'features', 'tones', 'general', 'legal', 'connexion'] as string[]).includes(wanted)) {
      setTab(wanted as Tab)
    }
  }, [])
  const [toast, setToast]           = useState<ToastState>(null)
  const [confirming, setConfirming] = useState(false)
  const [resetting, setResetting]   = useState(false)
  const [dirtyMap, setDirtyMap]     = useState<Record<DirtySource, boolean>>({
    identity: false, appearance: false, features: false, tones: false,
    general: false, connexion: false, smtp: false, oidc: false, legal: false,
  })

  // Stable per-source callbacks so a parent re-render doesn't retrigger every child's dirty effect.
  const setDirty = useMemo(() => {
    const sources: DirtySource[] = ['identity', 'appearance', 'features', 'tones', 'general', 'connexion', 'smtp', 'oidc', 'legal']
    return Object.fromEntries(sources.map(source => [
      source,
      (dirty: boolean) => setDirtyMap(prev => prev[source] === dirty ? prev : { ...prev, [source]: dirty }),
    ])) as Record<DirtySource, (dirty: boolean) => void>
  }, [])

  const tabDirty: Record<Tab, boolean> = {
    identity:   dirtyMap.identity,
    appearance: dirtyMap.appearance,
    features:   dirtyMap.features,
    tones:      dirtyMap.tones,
    general:    dirtyMap.general,
    legal:      dirtyMap.legal,
    connexion:  dirtyMap.connexion || dirtyMap.smtp || dirtyMap.oidc,
  }
  const anyDirty = useMemo(() => Object.values(dirtyMap).some(Boolean), [dirtyMap])
  useAdminDirtyRegister('settings', anyDirty)

  async function handleReset() {
    if (!confirming) { setConfirming(true); return }
    setResetting(true)
    setConfirming(false)
    try {
      const res = await fetch('/api/admin/settings/reset', { method: 'POST' })
      if (!res.ok) throw new Error()
      setToast({ type: 'success', message: st.toastSuccess })
      setTimeout(() => window.location.reload(), 800)
    } catch {
      setToast({ type: 'error', message: st.toastError })
    } finally {
      setResetting(false)
    }
  }

  const branding = (settings.branding as Record<string, unknown>) ?? {}
  const design   = (settings.design   as Record<string, unknown>) ?? {}

  // headerLogoSize moved from `design` to `branding` —
  // fall back to the old key so installs that haven't re-saved this form yet keep their value.
  const brandingInitial = { ...branding, headerLogoSize: branding.headerLogoSize ?? design.headerLogoSize }
  const designInitial   = design

  return (
    <>
      {/* Reset button row */}
      <div className="flex items-center justify-end mb-4 gap-2">
        {confirming && (
          <span className="text-xs text-on-surface-variant">{st.confirmLabel}</span>
        )}
        {confirming && (
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="text-xs text-on-surface-variant hover:text-on-surface px-2 py-1 transition-colors"
          >
            {st.cancelReset}
          </button>
        )}
        <button
          type="button"
          onClick={handleReset}
          disabled={resetting}
          className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-all ${
            confirming
              ? 'border-error/60 text-error bg-error/5 hover:bg-error/10'
              : 'border-outline-variant/30 text-on-surface-variant hover:text-on-surface hover:border-outline-variant/60'
          }`}
        >
          <span className="material-symbols-outlined text-sm leading-none" aria-hidden="true">
            {resetting ? 'hourglass_empty' : 'restart_alt'}
          </span>
          {confirming ? st.confirmReset : st.resetDefaults}
        </button>
      </div>

      <ServiceTabBar
        ariaLabel={st.tabsAriaLabel}
        dirtyLabel={t.adminDirty.unsavedBadge}
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'identity',   label: st.tabIdentity,   icon: 'palette',       dirty: tabDirty.identity   },
          { id: 'appearance', label: st.tabAppearance, icon: 'brush',         dirty: tabDirty.appearance },
          { id: 'features',   label: st.tabFeatures,   icon: 'tune',          dirty: tabDirty.features   },
          { id: 'tones',      label: st.tabTones,      icon: 'auto_fix_high', dirty: tabDirty.tones      },
          { id: 'general',    label: st.tabGeneral,    icon: 'info',          dirty: tabDirty.general    },
          { id: 'legal',      label: st.tabLegal,      icon: 'gavel',         dirty: tabDirty.legal      },
          { id: 'connexion',  label: st.tabConnexion,  icon: 'lock',          dirty: tabDirty.connexion  },
        ]}
      />

      {/* All panels stay mounted so unsaved edits survive switching tabs */}
      <div className={tab === 'identity' ? '' : 'hidden'}>
        <BrandingForm initial={brandingInitial as never} onToast={setToast} onDirtyChange={setDirty.identity} />
      </div>
      <div className={tab === 'appearance' ? '' : 'hidden'}>
        <DesignForm initial={designInitial as never} onToast={setToast} onDirtyChange={setDirty.appearance} />
      </div>
      <div className={tab === 'features' ? '' : 'hidden'}>
        <FeaturesForm initial={settings.features as never ?? {}} onToast={setToast} onDirtyChange={setDirty.features} />
      </div>
      <div className={tab === 'tones' ? '' : 'hidden'}>
        <TonesForm initial={(settings.rewrite_tones as ToneConfig[] | undefined) ?? []} onToast={setToast} onDirtyChange={setDirty.tones} />
      </div>
      <div className={tab === 'general' ? '' : 'hidden'}>
        <GeneralForm initial={settings.general as never ?? {}} onToast={setToast} onDirtyChange={setDirty.general} />
      </div>
      <div className={tab === 'legal' ? '' : 'hidden'}>
        <LegalForm initial={(settings.legal as Record<string, string> | undefined) ?? {}} onToast={setToast} onDirtyChange={setDirty.legal} />
      </div>
      <div className={tab === 'connexion' ? '' : 'hidden'}>
        <ConnexionForm initial={{ method: authMethod, allowedDomains, inviteOnly }} smtp={smtp} oidc={oidc} onToast={setToast} onDirtyChange={setDirty.connexion} />
        {/* SMTP lives here, not under General: it only matters as a prerequisite for two of the sign-in methods above */}
        <div className="mt-3">
          <SmtpForm initial={smtp} onToast={setToast} onDirtyChange={setDirty.smtp} />
        </div>
        <div className="mt-3">
          <OidcForm initial={oidc} onToast={setToast} onDirtyChange={setDirty.oidc} />
        </div>
      </div>

      <AdminToast toast={toast} onDismiss={() => setToast(null)} />
    </>
  )
}

'use client'

import { useState } from 'react'
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

interface Props {
  settings: Record<string, unknown>
  smtp: SmtpPublicConfig
  oidc: OidcPublicConfig
  authMethod: AuthMethod
}

type Tab = 'identity' | 'appearance' | 'features' | 'tones' | 'general' | 'legal' | 'connexion'

export function SettingsTabs({ settings, smtp, oidc, authMethod }: Props) {
  const { t } = useI18n()
  const st = t.settingsTabs
  const [tab, setTab]               = useState<Tab>('identity')
  const [toast, setToast]           = useState<ToastState>(null)
  const [confirming, setConfirming] = useState(false)
  const [resetting, setResetting]   = useState(false)

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
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'identity',   label: st.tabIdentity,   icon: 'palette'        },
          { id: 'appearance', label: st.tabAppearance, icon: 'brush'          },
          { id: 'features',   label: st.tabFeatures,   icon: 'tune'           },
          { id: 'tones',      label: st.tabTones,      icon: 'auto_fix_high' },
          { id: 'general',    label: st.tabGeneral,    icon: 'info'           },
          { id: 'legal',      label: st.tabLegal,      icon: 'gavel'          },
          { id: 'connexion',  label: st.tabConnexion,  icon: 'lock'           },
        ]}
      />

      {/* All panels stay mounted so unsaved edits survive switching tabs */}
      <div className={tab === 'identity' ? '' : 'hidden'}>
        <BrandingForm initial={brandingInitial as never} onToast={setToast} />
      </div>
      <div className={tab === 'appearance' ? '' : 'hidden'}>
        <DesignForm initial={designInitial as never} onToast={setToast} />
      </div>
      <div className={tab === 'features' ? '' : 'hidden'}>
        <FeaturesForm initial={settings.features as never ?? {}} onToast={setToast} />
      </div>
      <div className={tab === 'tones' ? '' : 'hidden'}>
        <TonesForm initial={(settings.rewrite_tones as ToneConfig[] | undefined) ?? []} onToast={setToast} />
      </div>
      <div className={tab === 'general' ? '' : 'hidden'}>
        <GeneralForm initial={settings.general as never ?? {}} onToast={setToast} />
        <div className="mt-3">
          <SmtpForm initial={smtp} onToast={setToast} />
        </div>
      </div>
      <div className={tab === 'legal' ? '' : 'hidden'}>
        <LegalForm initial={(settings.legal as Record<string, string> | undefined) ?? {}} onToast={setToast} />
      </div>
      <div className={tab === 'connexion' ? '' : 'hidden'}>
        <ConnexionForm initial={{ method: authMethod }} smtp={smtp} oidc={oidc} onToast={setToast} />
        <div className="mt-3">
          <OidcForm initial={oidc} onToast={setToast} />
        </div>
      </div>

      <AdminToast toast={toast} onDismiss={() => setToast(null)} />
    </>
  )
}

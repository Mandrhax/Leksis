'use client'

import { useState } from 'react'
import { CaddyServiceForm } from './CaddyServiceForm'
import { CaddyMetrics }     from './CaddyMetrics'
import { AdminToast }       from './AdminToast'
import type { ToastState }  from './AdminToast'
import { useI18n } from '@/lib/i18n'
import { ServiceTabBar } from './ServiceTabBar'
import type { CaddyConfig } from '@/lib/caddy-config'

interface Props {
  initial: CaddyConfig
}

type Tab = 'access' | 'monitoring'

export function CaddyServicesLayout({ initial }: Props) {
  const { t } = useI18n()
  const cf = t.caddyForm
  const [tab, setTab] = useState<Tab>('access')
  const [toast, setToast] = useState<ToastState>(null)

  return (
    <>
      <ServiceTabBar
        ariaLabel={cf.tabsAriaLabel}
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'access',     label: cf.tabAccess,     icon: 'router' },
          { id: 'monitoring', label: cf.tabMonitoring, icon: 'monitoring' },
        ]}
      />

      {/* Both panels stay mounted so unsaved edits survive switching tabs */}
      <div className={tab === 'access' ? '' : 'hidden'}>
        <CaddyServiceForm initial={initial} onToast={setToast} />
      </div>
      <div className={tab === 'monitoring' ? '' : 'hidden'}>
        <CaddyMetrics />
      </div>

      <AdminToast toast={toast} onDismiss={() => setToast(null)} />
    </>
  )
}

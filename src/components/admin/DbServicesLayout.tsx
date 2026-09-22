'use client'

import { useState } from 'react'
import { DbServiceForm } from './DbServiceForm'
import { DbMetrics }     from './DbMetrics'
import { AdminToast }    from './AdminToast'
import type { ToastState } from './AdminToast'
import { useI18n } from '@/lib/i18n'
import { ServiceTabBar } from './ServiceTabBar'

interface Props {
  initial: { host: string; port: number; database: string; user: string }
}

type Tab = 'connection' | 'monitoring'

export function DbServicesLayout({ initial }: Props) {
  const { t } = useI18n()
  const df = t.dbForm
  const [tab, setTab] = useState<Tab>('connection')
  const [toast, setToast] = useState<ToastState>(null)

  return (
    <>
      <ServiceTabBar
        ariaLabel={df.tabsAriaLabel}
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'connection', label: df.tabConnection, icon: 'database' },
          { id: 'monitoring', label: df.tabMonitoring,  icon: 'monitoring' },
        ]}
      />

      {/* Both panels stay mounted so unsaved edits survive switching tabs */}
      <div className={tab === 'connection' ? '' : 'hidden'}>
        <DbServiceForm initial={initial} onToast={setToast} />
      </div>
      <div className={tab === 'monitoring' ? '' : 'hidden'}>
        <DbMetrics />
      </div>

      <AdminToast toast={toast} onDismiss={() => setToast(null)} />
    </>
  )
}

'use client'

import { useState } from 'react'
import { AiServiceForm }        from './AiServiceForm'
import { AdminToast }           from './AdminToast'
import type { ToastState }      from './AdminToast'
import type { AiPublicConfig }  from '@/lib/llm/types'
import { useI18n } from '@/lib/i18n'
import { ServiceTabBar } from './ServiceTabBar'
import { OllamaMetricsProvider, OllamaStatusBlock, OllamaInstalledBlock, OllamaRunningBlock } from './OllamaMetrics'

interface Props {
  initial: AiPublicConfig
}

type Tab = 'config' | 'models' | 'monitoring'

export function OllamaServicesLayout({ initial }: Props) {
  const { t } = useI18n()
  const of = t.ollamaForm
  const [tab, setTab] = useState<Tab>('config')
  const [toast, setToast] = useState<ToastState>(null)

  return (
    <OllamaMetricsProvider>
      <ServiceTabBar
        ariaLabel={of.tabsAriaLabel}
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'config',     label: of.tabConfig,     icon: 'settings_ethernet' },
          { id: 'models',     label: of.tabModels,     icon: 'smart_toy' },
          { id: 'monitoring', label: of.tabMonitoring, icon: 'monitoring' },
        ]}
      />

      <AiServiceForm initial={initial} onToast={setToast} activeTab={tab} />

      {tab === 'monitoring' && (
        <div className="flex flex-col gap-4">
          <OllamaStatusBlock />
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <OllamaInstalledBlock />
            <OllamaRunningBlock />
          </div>
        </div>
      )}

      <AdminToast toast={toast} onDismiss={() => setToast(null)} />
    </OllamaMetricsProvider>
  )
}

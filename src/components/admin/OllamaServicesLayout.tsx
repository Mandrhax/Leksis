'use client'

import { useState } from 'react'
import { AiServiceForm }        from './AiServiceForm'
import { AdminToast }           from './AdminToast'
import type { ToastState }      from './AdminToast'
import type { AiPublicConfig }  from '@/lib/llm/types'
import { useI18n } from '@/lib/i18n'
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

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'config',     label: of.tabConfig,     icon: 'settings_ethernet' },
    { id: 'models',     label: of.tabModels,     icon: 'smart_toy' },
    { id: 'monitoring', label: of.tabMonitoring, icon: 'monitoring' },
  ]

  return (
    <OllamaMetricsProvider>
      <div className="flex gap-2 sm:gap-6 border-b border-outline-variant/20 mb-6" role="tablist" aria-label={of.tabsAriaLabel}>
        {tabs.map(tb => (
          <button
            key={tb.id}
            role="tab"
            type="button"
            aria-selected={tab === tb.id}
            onClick={() => setTab(tb.id)}
            className={`tab-btn py-3 px-2 text-sm font-medium border-b-2 transition-all ${
              tab === tb.id
                ? 'text-on-surface border-primary'
                : 'text-on-surface-variant border-transparent hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined align-middle mr-1.5 text-lg" aria-hidden="true">{tb.icon}</span>
            {tb.label}
          </button>
        ))}
      </div>

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

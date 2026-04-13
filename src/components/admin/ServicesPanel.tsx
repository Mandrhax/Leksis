'use client'

import { useState } from 'react'
import { OllamaServiceForm } from './OllamaServiceForm'
import { DbServiceForm }     from './DbServiceForm'
import { AdminToast }        from './AdminToast'
import type { ToastState }   from './AdminToast'
import { useI18n }           from '@/lib/i18n'

interface Props {
  ollamaInitial: { baseUrl: string; translationModel: string; ocrModel: string; rewriteModel: string; sameModelForAll: boolean }
  dbInitial:     { host: string; port: number; database: string; user: string }
}

export function ServicesPanel({ ollamaInitial, dbInitial }: Props) {
  const { t } = useI18n()
  const [active, setActive] = useState<'ai' | 'db'>('ai')
  const [toast, setToast]   = useState<ToastState>(null)

  const TABS = [
    { id: 'ai' as const, label: t.adminPages.servicesTabAI, icon: 'smart_toy'   },
    { id: 'db' as const, label: t.adminPages.servicesTabDb, icon: 'storage'     },
  ]

  return (
    <>
      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-outline-variant/10 mb-6">
        {TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActive(tab.id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all -mb-px ${
              active === tab.id
                ? 'text-on-surface border-primary'
                : 'text-on-surface-variant border-transparent hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-base leading-none" aria-hidden="true">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="space-y-6">
        {active === 'ai' && <OllamaServiceForm initial={ollamaInitial} onToast={setToast} />}
        {active === 'db' && <DbServiceForm     initial={dbInitial}     onToast={setToast} />}
      </div>

      <AdminToast toast={toast} onDismiss={() => setToast(null)} />
    </>
  )
}

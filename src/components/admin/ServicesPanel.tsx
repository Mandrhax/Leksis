'use client'

import { useState } from 'react'
import { OllamaServiceForm } from './OllamaServiceForm'
import { DbServiceForm }     from './DbServiceForm'
import { AdminToast }        from './AdminToast'
import type { ToastState }   from './AdminToast'

interface Props {
  ollamaInitial: { baseUrl: string; model: string; ocrModel: string }
  dbInitial:     { host: string; port: number; database: string; user: string }
}

export function ServicesPanel({ ollamaInitial, dbInitial }: Props) {
  const [toast, setToast] = useState<ToastState>(null)

  return (
    <>
      <div className="space-y-6">
        <OllamaServiceForm initial={ollamaInitial} onToast={setToast} />
        <DbServiceForm     initial={dbInitial}     onToast={setToast} />
      </div>
      <AdminToast toast={toast} onDismiss={() => setToast(null)} />
    </>
  )
}

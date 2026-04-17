'use client'

import { useState } from 'react'
import { OllamaServiceForm } from './OllamaServiceForm'
import { DbServiceForm }     from './DbServiceForm'
import { CaddyServiceForm }  from './CaddyServiceForm'
import { AdminToast }        from './AdminToast'
import type { ToastState }   from './AdminToast'

interface OllamaProps {
  mode: 'ai'
  initial: { baseUrl: string; translationModel: string; ocrModel: string; rewriteModel: string; sameModelForAll: boolean }
}

interface DbProps {
  mode: 'db'
  initial: { host: string; port: number; database: string; user: string }
}

interface CaddyProps {
  mode: 'caddy'
  initial: { host: string; behindProxy: boolean }
}

type Props = OllamaProps | DbProps | CaddyProps

export function ServicesPanel(props: Props) {
  const [toast, setToast] = useState<ToastState>(null)

  return (
    <>
      {props.mode === 'ai'
        ? <OllamaServiceForm initial={props.initial} onToast={setToast} />
        : props.mode === 'db'
        ? <DbServiceForm     initial={props.initial} onToast={setToast} />
        : <CaddyServiceForm  initial={props.initial} onToast={setToast} />
      }
      <AdminToast toast={toast} onDismiss={() => setToast(null)} />
    </>
  )
}

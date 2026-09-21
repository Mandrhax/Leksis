'use client'

import { useState } from 'react'
import { AiServiceForm }     from './AiServiceForm'
import { DbServiceForm }     from './DbServiceForm'
import { CaddyServiceForm }  from './CaddyServiceForm'
import { AdminToast }        from './AdminToast'
import type { ToastState }   from './AdminToast'
import type { AiPublicConfig } from '@/lib/llm/types'

interface AiProps {
  mode: 'ai'
  initial: AiPublicConfig
}

interface DbProps {
  mode: 'db'
  initial: { host: string; port: number; database: string; user: string }
}

interface CaddyProps {
  mode: 'caddy'
  initial: { host: string; behindProxy: boolean }
}

type Props = AiProps | DbProps | CaddyProps

export function ServicesPanel(props: Props) {
  const [toast, setToast] = useState<ToastState>(null)

  return (
    <>
      {props.mode === 'ai'
        ? <AiServiceForm     initial={props.initial} onToast={setToast} />
        : props.mode === 'db'
        ? <DbServiceForm     initial={props.initial} onToast={setToast} />
        : <CaddyServiceForm  initial={props.initial} onToast={setToast} />
      }
      <AdminToast toast={toast} onDismiss={() => setToast(null)} />
    </>
  )
}

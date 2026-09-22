'use client'

import { useState } from 'react'
import { DbServiceForm }     from './DbServiceForm'
import { CaddyServiceForm }  from './CaddyServiceForm'
import { AdminToast }        from './AdminToast'
import type { ToastState }   from './AdminToast'
import type { CaddyConfig }     from '@/lib/caddy-config'

interface DbProps {
  mode: 'db'
  initial: { host: string; port: number; database: string; user: string }
}

interface CaddyProps {
  mode: 'caddy'
  initial: CaddyConfig
}

type Props = DbProps | CaddyProps

export function ServicesPanel(props: Props) {
  const [toast, setToast] = useState<ToastState>(null)

  return (
    <>
      {props.mode === 'db'
        ? <DbServiceForm     initial={props.initial} onToast={setToast} />
        : <CaddyServiceForm  initial={props.initial} onToast={setToast} />
      }
      <AdminToast toast={toast} onDismiss={() => setToast(null)} />
    </>
  )
}

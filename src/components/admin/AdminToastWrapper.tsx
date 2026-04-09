'use client'

import { useState, cloneElement, isValidElement, Children } from 'react'
import { AdminToast } from './AdminToast'
import type { ToastState } from './AdminToast'

export function AdminToastWrapper({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState>(null)

  const childrenWithProps = Children.map(children, child => {
    if (isValidElement(child)) {
      return cloneElement(child as React.ReactElement<{ onToast?: (t: ToastState) => void }>, { onToast: setToast })
    }
    return child
  })

  return (
    <>
      {childrenWithProps}
      <AdminToast toast={toast} onDismiss={() => setToast(null)} />
    </>
  )
}

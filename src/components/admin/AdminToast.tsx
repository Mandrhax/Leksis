'use client'

import { useEffect } from 'react'

export type ToastState = { message: string; type: 'success' | 'warning' | 'error' } | null

interface Props {
  toast: ToastState
  onDismiss: () => void
}

export function AdminToast({ toast, onDismiss }: Props) {
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(onDismiss, 3500)
    return () => clearTimeout(t)
  }, [toast, onDismiss])

  if (!toast) return null

  const isSuccess = toast.type === 'success'
  const isWarning = toast.type === 'warning'
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-6 right-6 z-[400] flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg text-sm font-medium
        ${isSuccess
          ? 'bg-surface-container-lowest border border-primary/20 text-on-surface'
          : isWarning
          ? 'bg-surface-container-lowest border border-yellow-500/30 text-yellow-700 dark:text-yellow-400'
          : 'bg-surface-container-lowest border border-error/20 text-error'
        }`}
    >
      <span className="material-symbols-outlined text-base leading-none" aria-hidden="true">
        {isSuccess ? 'check_circle' : isWarning ? 'warning' : 'error'}
      </span>
      {toast.message}
      <button
        onClick={onDismiss}
        className="ml-2 text-on-surface-variant hover:text-on-surface transition-colors"
        aria-label="Fermer"
      >
        <span className="material-symbols-outlined text-base leading-none" aria-hidden="true">close</span>
      </button>
    </div>
  )
}

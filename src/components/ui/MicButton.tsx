'use client'

import { useState } from 'react'
import { useAudioRecorder } from '@/hooks/useAudioRecorder'
import { useI18n } from '@/lib/i18n'

interface Props {
  /** Quel onglet dicte — décide le libellé i18n et le feature flag vérifié côté serveur */
  feature:      'text' | 'rewrite'
  onTranscript: (text: string) => void
  disabled?:    boolean
}

export function MicButton({ feature, onTranscript, disabled }: Props) {
  const { t } = useI18n()
  const labels = feature === 'rewrite' ? t.rewriteTab : t.textTab

  const { recording, start, stop, error: recordError } = useAudioRecorder()
  const [transcribing, setTranscribing] = useState(false)
  const [uploadError, setUploadError]   = useState(false)

  async function handleClick() {
    setUploadError(false)
    if (recording) {
      const blob = await stop()
      if (!blob) return
      setTranscribing(true)
      try {
        const formData = new FormData()
        formData.append('audio', blob, 'recording')
        formData.append('feature', feature)
        const res = await fetch('/api/dictate', { method: 'POST', body: formData })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error()
        if (data.text) onTranscript(data.text)
      } catch {
        setUploadError(true)
      } finally {
        setTranscribing(false)
      }
    } else {
      await start()
    }
  }

  const busy  = transcribing
  const title = recordError ? labels.micPermissionDenied
    : uploadError            ? labels.micError
    : recording              ? labels.micStop
    : transcribing           ? labels.micProcessing
    : labels.micStart

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || busy}
      className={`p-2 rounded-md transition-colors disabled:opacity-30 ${
        recording ? 'bg-error/10 text-error' : 'hover:bg-surface-container-high text-on-surface-variant'
      }`}
      title={title}
      aria-label={title}
      aria-pressed={recording}
    >
      {busy
        ? <span className="material-symbols-outlined animate-spin text-lg leading-none" aria-hidden="true">progress_activity</span>
        : <span className="material-symbols-outlined text-lg leading-none" aria-hidden="true">{recording ? 'stop_circle' : 'mic'}</span>
      }
    </button>
  )
}

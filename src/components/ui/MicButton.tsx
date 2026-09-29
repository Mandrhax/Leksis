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

function formatElapsed(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function MicButton({ feature, onTranscript, disabled }: Props) {
  const { t } = useI18n()
  const labels = feature === 'rewrite' ? t.rewriteTab : t.textTab

  const { recording, start, stop, error: recordError, elapsedSeconds } = useAudioRecorder()
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
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || busy}
        className={`relative p-2 rounded-md transition-colors disabled:opacity-30 ${
          recording ? 'bg-error/10 text-error' : 'hover:bg-surface-container-high text-on-surface-variant'
        }`}
        title={title}
        aria-label={title}
        aria-pressed={recording}
      >
        {/* Pastille qui pulse : seul signal fiable que le micro capture bien (le bouton seul ne le montre pas) */}
        {recording && (
          <span className="absolute top-1 right-1 flex h-2 w-2" aria-hidden="true">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-error opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-error" />
          </span>
        )}
        {busy
          ? <span className="material-symbols-outlined animate-spin text-lg leading-none" aria-hidden="true">progress_activity</span>
          : <span className="material-symbols-outlined text-lg leading-none" aria-hidden="true">{recording ? 'stop_circle' : 'mic'}</span>
        }
      </button>
      {recording && (
        <span className="text-xs font-medium text-error tabular-nums" role="status" aria-live="polite">
          {formatElapsed(elapsedSeconds)}
        </span>
      )}
      {uploadError && !recording && (
        <span className="text-xs text-error">{labels.micError}</span>
      )}
    </div>
  )
}

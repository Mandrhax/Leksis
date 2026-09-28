import { useState, useCallback, useRef } from 'react'

const MAX_RECORDING_SECONDS = 120

/**
 * Enregistrement audio micro (MediaRecorder natif). Ne fait qu'enregistrer : l'appelant
 * décide quoi faire du blob (l'envoyer à /api/dictate, l'abandonner, etc.).
 */
export function useAudioRecorder() {
  const [recording, setRecording] = useState(false)
  const [error, setError]         = useState<string | null>(null)

  const recorderRef    = useRef<MediaRecorder | null>(null)
  const chunksRef       = useRef<Blob[]>([])
  const stopTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stopResolveRef  = useRef<((blob: Blob | null) => void) | null>(null)

  const stop = useCallback((): Promise<Blob | null> => {
    return new Promise(resolve => {
      if (stopTimerRef.current) { clearTimeout(stopTimerRef.current); stopTimerRef.current = null }
      const recorder = recorderRef.current
      if (!recorder || recorder.state === 'inactive') { resolve(null); return }
      stopResolveRef.current = resolve
      recorder.stop()
      setRecording(false)
    })
  }, [])

  const start = useCallback(async () => {
    setError(null)
    chunksRef.current = []
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      recorderRef.current = recorder

      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = () => {
        const blob = chunksRef.current.length ? new Blob(chunksRef.current, { type: recorder.mimeType }) : null
        stream.getTracks().forEach(track => track.stop())
        recorderRef.current = null
        stopResolveRef.current?.(blob)
        stopResolveRef.current = null
      }

      recorder.start()
      setRecording(true)
      stopTimerRef.current = setTimeout(() => { void stop() }, MAX_RECORDING_SECONDS * 1000)
    } catch {
      setError('permission_denied')
    }
  }, [stop])

  return { recording, start, stop, error }
}

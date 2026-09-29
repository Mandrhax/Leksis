import { useState, useCallback, useRef } from 'react'

const MAX_RECORDING_SECONDS = 120

/**
 * Enregistrement audio micro (MediaRecorder natif). Ne fait qu'enregistrer : l'appelant
 * décide quoi faire du blob (l'envoyer à /api/dictate, l'abandonner, etc.).
 */
export function useAudioRecorder() {
  const [recording, setRecording] = useState(false)
  const [error, setError]         = useState<string | null>(null)
  // Compteur affiché pendant l'enregistrement — seul signal fiable pour l'utilisateur que le micro capture bien
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  const recorderRef    = useRef<MediaRecorder | null>(null)
  const chunksRef       = useRef<Blob[]>([])
  const stopTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const stopResolveRef  = useRef<((blob: Blob | null) => void) | null>(null)

  const clearTimers = () => {
    if (stopTimerRef.current)    { clearTimeout(stopTimerRef.current);   stopTimerRef.current = null }
    if (elapsedTimerRef.current) { clearInterval(elapsedTimerRef.current); elapsedTimerRef.current = null }
  }

  const stop = useCallback((): Promise<Blob | null> => {
    return new Promise(resolve => {
      clearTimers()
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
        clearTimers()
        const blob = chunksRef.current.length ? new Blob(chunksRef.current, { type: recorder.mimeType }) : null
        stream.getTracks().forEach(track => track.stop())
        recorderRef.current = null
        stopResolveRef.current?.(blob)
        stopResolveRef.current = null
      }

      recorder.start()
      setRecording(true)
      setElapsedSeconds(0)
      elapsedTimerRef.current = setInterval(() => setElapsedSeconds(s => s + 1), 1000)
      stopTimerRef.current = setTimeout(() => { void stop() }, MAX_RECORDING_SECONDS * 1000)
    } catch {
      setError('permission_denied')
    }
  }, [stop])

  return { recording, start, stop, error, elapsedSeconds }
}

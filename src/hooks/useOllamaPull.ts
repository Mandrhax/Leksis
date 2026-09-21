import { useState, useCallback } from 'react'

export interface PullResult { ok: boolean; error?: string }

/**
 * Pulls a model through POST /api/admin/services/ollama/pull (ndjson stream).
 * Progress is aggregated over all layers (digests) so the bar never restarts
 * at 0 when Ollama moves on to the next layer, and never goes backwards.
 */
export function useOllamaPull() {
  const [pulling,  setPulling]  = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [status,   setStatus]   = useState('')

  const pull = useCallback(async (model: string): Promise<PullResult> => {
    setPulling(true)
    setProgress(null)
    setStatus('')

    const layers: Record<string, { total: number; completed: number }> = {}
    let best = 0
    let ok = false
    let error: string | undefined

    try {
      const res = await fetch('/api/admin/services/ollama/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
      })
      if (!res.ok || !res.body) return { ok: false }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const parsed = JSON.parse(line) as {
              status?: string; error?: string; digest?: string; total?: number; completed?: number
            }
            if (parsed.error) error = parsed.error
            if (parsed.status) setStatus(parsed.status)
            if (parsed.digest && parsed.total && parsed.total > 0) {
              layers[parsed.digest] = { total: parsed.total, completed: parsed.completed ?? 0 }
              let total = 0
              let completed = 0
              for (const l of Object.values(layers)) { total += l.total; completed += l.completed }
              best = Math.max(best, Math.round((completed / total) * 100))
              setProgress(best)
            }
            if (parsed.status === 'success') ok = true
          } catch { /* ignore malformed lines */ }
        }
      }
    } catch {
      return { ok: false, error }
    } finally {
      setPulling(false)
    }
    return { ok: ok && !error, error }
  }, [])

  return { pull, pulling, progress, status }
}

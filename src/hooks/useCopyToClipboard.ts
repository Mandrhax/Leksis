import { useState, useCallback } from 'react'

/**
 * Returns [copied, copy] where `copy(text)` writes to clipboard
 * and `copied` is true for 2 seconds after a successful copy.
 */
export function useCopyToClipboard(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false)

  const copy = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [])

  return [copied, copy]
}

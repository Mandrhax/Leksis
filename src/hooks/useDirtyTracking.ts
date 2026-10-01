'use client'

import { useCallback, useState } from 'react'

/**
 * Tracks whether `value` has diverged from the last point it was marked saved.
 * `value` should cover every piece of state whose loss on navigation would matter
 * (e.g. a pending password field, not just the object sent to the API) — fields
 * that are already persisted the instant they change (file uploads…) should be
 * left out instead.
 */
export function useDirtyTracking<T>(value: T) {
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(value))
  const dirty = JSON.stringify(value) !== savedSnapshot

  // Accepts an explicit post-save value to avoid stale closures when a save
  // handler resets transient fields (e.g. a password input) in the same tick.
  const markSaved = useCallback((overrideValue?: T) => {
    setSavedSnapshot(JSON.stringify(overrideValue ?? value))
  }, [value])

  return { dirty, markSaved }
}

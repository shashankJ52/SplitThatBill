import { useCallback, useSyncExternalStore } from 'react'

// Small in-memory store for screen state that should survive navigating away and back
// (filters, open tabs) but not a page reload.
const values = new Map<string, unknown>()
const subs = new Set<() => void>()
const subscribe = (cb: () => void) => {
  subs.add(cb)
  return () => subs.delete(cb)
}

export function useUiState<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const value = useSyncExternalStore(subscribe, () => (values.has(key) ? (values.get(key) as T) : initial))
  const set = useCallback(
    (v: T | ((p: T) => T)) => {
      const prev = values.has(key) ? (values.get(key) as T) : initial
      const next = typeof v === 'function' ? (v as (p: T) => T)(prev) : v
      if (Object.is(next, prev)) return
      values.set(key, next)
      subs.forEach((s) => s())
    },
    [key, initial],
  )
  return [value, set]
}

/** Forget remembered screen state (used on log out and in tests). */
export function resetUiState() {
  values.clear()
  subs.forEach((s) => s())
}

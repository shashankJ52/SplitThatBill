import { useSyncExternalStore } from 'react'

/** The width from which the app uses its laptop and iPad layout (a sidebar instead of a bottom tab bar). */
export const WIDE_QUERY = '(min-width: 768px)'

const subscribe = (cb: () => void) => {
  const m = window.matchMedia(WIDE_QUERY)
  m.addEventListener('change', cb)
  return () => m.removeEventListener('change', cb)
}

/** True on a laptop or an iPad, false on a phone. Follows the window as it is resized or turned. */
export function useWide(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(WIDE_QUERY).matches, () => false)
}

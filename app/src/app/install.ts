import { useSyncExternalStore } from 'react'

/** The browser's install prompt (Chrome, Edge, Android). Not in the standard type definitions. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: BeforeInstallPromptEvent | null = null
let installed = false
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())

/** Start listening early: the browser offers the install prompt once, soon after the page loads. */
export function captureInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    emit()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    installed = true
    emit()
  })
}

/** Opened from the home screen (or as an installed app) rather than in a browser tab. */
export const isStandalone = (): boolean => {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
  } catch {
    return false
  }
}

/** iPhone or iPad, where the only way to install is Share, then Add to Home Screen. */
export const isIos = (): boolean => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferred) return 'unavailable'
  const e = deferred
  deferred = null
  emit()
  await e.prompt()
  const { outcome } = await e.userChoice
  return outcome
}

const subscribe = (cb: () => void) => {
  subs.add(cb)
  return () => void subs.delete(cb)
}

/** What the install button needs to know: already installed, can the browser prompt, is this iOS. */
export function useInstall() {
  const canPrompt = useSyncExternalStore(subscribe, () => deferred !== null)
  const done = useSyncExternalStore(subscribe, () => installed)
  return { standalone: isStandalone() || done, ios: isIos(), canPrompt, prompt: promptInstall }
}

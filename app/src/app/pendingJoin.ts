/** A group link opened while signed out is remembered, so it can be followed after logging in or signing up. */
const KEY = 'stb-join'

export function rememberJoin(code: string) {
  try {
    sessionStorage.setItem(KEY, code)
  } catch {
    /* storage can be blocked; the person can open the link again */
  }
}
export function pendingJoin(): string | null {
  try {
    return sessionStorage.getItem(KEY)
  } catch {
    return null
  }
}
export function clearPendingJoin() {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

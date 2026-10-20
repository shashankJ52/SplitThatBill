/**
 * Who is in the middle of confirming their email. Kept for the browser session (never the password), so a refresh of
 * the code page, or coming back to it from the log-in page, does not lose it.
 */
export interface PendingSignup {
  name: string
  email: string
  tag: string
}

const KEY = 'stb-signup-pending'

export function readPending(): PendingSignup | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    const p = raw ? (JSON.parse(raw) as PendingSignup) : null
    return p && typeof p.email === 'string' ? p : null
  } catch {
    return null
  }
}
export function writePending(p: PendingSignup | null) {
  try {
    if (p) sessionStorage.setItem(KEY, JSON.stringify(p))
    else sessionStorage.removeItem(KEY)
  } catch {
    /* storage can be blocked; the person can sign up again */
  }
}

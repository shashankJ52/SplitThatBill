import { EMAIL_RE, TAG_RE } from './util'

/** Tags nobody may take, on top of the ones already used by people in the app. */
export const RESERVED_TAGS = ['admin', 'support']
export const MAX_LOGIN_TRIES = 5
export const LOCK_MS = 15_000
export const MAX_CODE_TRIES = 5
/** Until the email service exists, this is the code that works. */
export const DEMO_CODE = '123456'
/** The sample account's password, shown on the log-in screen only while it is still in use. */
export const DEMO_PASSWORD = 'password1'

export const PASSWORD_RULE = 'Password needs 8+ characters and a number'

export function pwScore(p: string): number {
  let s = 0
  if (p.length >= 8) s++
  if (/\d/.test(p)) s++
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++
  if (/[^A-Za-z0-9]/.test(p) || p.length >= 12) s++
  return s
}
export const PW_LABELS = ['Weak', 'Weak', 'Okay', 'Good', 'Strong']

/** Null when the password is acceptable. */
export const passwordProblem = (p: string): string | null => (p.length < 8 || !/\d/.test(p) ? PASSWORD_RULE : null)

export const maskEmail = (e: string): string => {
  const [name, host = ''] = e.split('@')
  return `${name.charAt(0)}••••@${host}`
}

export const normTag = (raw: string) => raw.trim().replace(/^@/, '').toLowerCase()

export type TagStatus = '' | 'invalid' | 'taken' | 'ok'
export function tagStatus(raw: string, taken: string[]): TagStatus {
  const t = normTag(raw)
  if (!t) return ''
  if (!TAG_RE.test(t)) return 'invalid'
  if (taken.map((x) => x.toLowerCase()).includes(t) || RESERVED_TAGS.includes(t)) return 'taken'
  return 'ok'
}

export interface SignupForm {
  name: string
  email: string
  tag: string
  pw: string
  terms: boolean
}
/** The first thing wrong with a sign-up form, or null. */
export function signupProblem(f: SignupForm, takenTags: string[], existingEmail?: string): string | null {
  const t = normTag(f.tag)
  if (!f.name.trim()) return 'Enter your name'
  if (!EMAIL_RE.test(f.email.trim())) return 'Enter a valid email'
  if (!TAG_RE.test(t)) return 'User tag is 3–20 letters, numbers or underscores'
  if (tagStatus(t, takenTags) === 'taken') return `@${t} is taken. Try another.`
  const pw = passwordProblem(f.pw)
  if (pw) return pw
  if (!f.terms) return 'Please agree to the Terms and Privacy Policy'
  if (existingEmail && f.email.trim().toLowerCase() === existingEmail.toLowerCase()) return 'That email already has an account. Log in instead.'
  return null
}

export interface Lockout {
  fails: number
  lockUntil: number
}
export const FRESH_LOCK: Lockout = { fails: 0, lockUntil: 0 }

/**
 * Record one log-in attempt. Never says which field was wrong. After five misses the form locks for 15 seconds.
 * While locked, attempts are refused without being counted.
 */
export function loginAttempt(l: Lockout, now: number, correct: boolean): { lock: Lockout; ok: boolean; msg?: string } {
  if (now < l.lockUntil) return { lock: l, ok: false, msg: `Too many attempts. Try again in ${Math.ceil((l.lockUntil - now) / 1000)}s.` }
  if (correct) return { lock: FRESH_LOCK, ok: true }
  const fails = l.fails + 1
  if (fails >= MAX_LOGIN_TRIES) return { lock: { fails: 0, lockUntil: now + LOCK_MS }, ok: false, msg: `Too many attempts. Try again in ${LOCK_MS / 1000}s.` }
  return { lock: { fails, lockUntil: 0 }, ok: false, msg: `Wrong email or password (${MAX_LOGIN_TRIES - fails} tries left)` }
}

/** Check a 6-digit email code. Five wrong tries block the code until a new one is requested. */
export function checkCode(tries: number, code: string): { tries: number; ok: boolean; msg?: string } {
  const c = code.trim()
  if (!/^\d{6}$/.test(c)) return { tries, ok: false, msg: 'Enter the 6-digit code' }
  if (tries >= MAX_CODE_TRIES) return { tries, ok: false, msg: 'Too many tries. Request a new code.' }
  if (c !== DEMO_CODE) return { tries: tries + 1, ok: false, msg: `That code isn't right (${MAX_CODE_TRIES - tries - 1} tries left)` }
  return { tries, ok: true }
}

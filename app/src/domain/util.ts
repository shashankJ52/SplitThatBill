export const MAX_CENTS = 100_000_000

export const COLORS = ['#0039A6', '#FF6319', '#6CBE45', '#996633', '#A7A9AC', '#FCCC0A', '#EE352E', '#00933C', '#B933AD']

/** Readable text color on a route-bullet color. */
export const ink = (c: string) => (c === '#FCCC0A' || c === '#6CBE45' || c === '#A7A9AC' ? '#000' : '#fff')

export function fmt(c: number): string {
  const s = c < 0 ? '-' : ''
  const a = Math.abs(c)
  return `${s}$${Math.floor(a / 100).toLocaleString('en-US')}.${String(a % 100).padStart(2, '0')}`
}

/** Parse a typed amount like "12.50" into cents, or null when invalid or too large. */
export function parseMoney(str: string): number | null {
  const t = str.replace(/[$,\s]/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null
  const c = Math.round(parseFloat(t) * 100)
  return c > MAX_CENTS ? null : c
}

/** Round to two decimals and drop trailing zeros (for portions). */
export const pf = (x: number) => String(Math.round(x * 100) / 100)

export function localISODate(d = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}
export const today = () => localISODate()
export const nowKey = () => today().slice(0, 7)

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const mLabel = (k: string) => `${MONTHS[+k.slice(5) - 1]} ${k.slice(0, 4)}`
export const mShort = (k: string) => MONTHS[+k.slice(5) - 1]
export function mAdd(k: string, n: number): string {
  const d = new Date(+k.slice(0, 4), +k.slice(5) - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** A date in the current month (back = 0) or an earlier one, never in the future. */
export function dateIn(back: number, day: number): string {
  const key = mAdd(nowKey(), -back)
  const d = back === 0 ? Math.min(day, +today().slice(8)) : Math.min(day, 28)
  return `${key}-${String(d).padStart(2, '0')}`
}

export function ago(ts: number, now = Date.now()): string {
  const m = Math.max(1, Math.round((now - ts) / 60000))
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

export const uid = (prefix: string) => prefix + Math.random().toString(36).slice(2, 9)
export const token = () => Math.random().toString(36).slice(2, 10)
export const clone = <T>(o: T): T => structuredClone(o)

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
export const TAG_RE = /^[a-z0-9_]{3,20}$/

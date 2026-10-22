import { formatMoney } from './currency'

export const MAX_CENTS = 100_000_000

export const COLORS = ['#0039A6', '#FF6319', '#6CBE45', '#996633', '#A7A9AC', '#FCCC0A', '#EE352E', '#00933C', '#B933AD']

/** Readable text color on a route-bullet color. */
export const ink = (c: string) => (c === '#FCCC0A' || c === '#6CBE45' || c === '#A7A9AC' ? '#000' : '#fff')

/** Cents as money in the given currency (dollars when none is given). */
export const fmt = (c: number, currency?: string): string => formatMoney(c, currency)

/** Parse a typed amount like "12.50" into cents, or null when invalid or too large. */
export function parseMoney(str: string): number | null {
  const t = str.replace(/[$€£₹฿,\s]/g, '')
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (s: string) => UUID_RE.test(s)
/** A new id. Real UUIDs, because the database needs ids that are unique across everyone's data. The argument is kept so call sites read as before. */
export const uid = (_kind = '') => crypto.randomUUID()
/** Several ids that belong together, made from one base id: the same input always gives the same ids. */
export const derivedId = (base: string, i: number) => (isUuid(base) ? base.slice(0, 24) + i.toString(16).padStart(12, '0') : `${base}_${i}`)
/** The secret in a share link: long enough that it cannot be guessed. */
export const token = () => crypto.randomUUID().replace(/-/g, '').slice(0, 20)
export const clone = <T>(o: T): T => structuredClone(o)

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
export const TAG_RE = /^[a-z0-9_]{3,20}$/

export interface MomentOptions {
  now?: number
  locale?: string
  /** an IANA zone such as "Asia/Kolkata"; the device's own zone when left out, which is what people should see */
  timeZone?: string
  /** older than yesterday: show the exact day and time ("Oct 14, 12:32 PM") instead of the bare expense date */
  exact?: boolean
}

/** The calendar day of a moment in a zone, as YYYY-MM-DD. */
const dayIn = (ts: number, timeZone?: string) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ts)
const dayNumber = (ymd: string) => Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10)) / 86_400_000

/** The time of day, in the viewer's zone and their usual 12 or 24 hour style. */
export const clockIn = (ts: number, locale?: string, timeZone?: string) => new Date(ts).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', timeZone })

/**
 * When something happened, for activity lists. The moment is stored as an exact instant, so it is shown in the time zone
 * of whoever is looking: the same payment reads 9:05 PM in California and 9:35 AM the next day in India.
 * Recent things say how long ago ("11 min ago") or the time of day ("Today, 12:20 AM", "Yesterday, 9:05 PM").
 * Older things show the date, or with `exact` the date and time. Without a recorded time it is just the date.
 */
export function whenLabel(ts: number | undefined, date: string, opt: MomentOptions | number = {}, legacyLocale?: string): string {
  const o: MomentOptions = typeof opt === 'number' ? { now: opt, locale: legacyLocale } : opt
  const now = o.now ?? Date.now()
  if (ts === undefined || !Number.isFinite(ts) || ts > now + 60_000) return date
  const mins = Math.floor((now - ts) / 60_000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins} min ago`
  const clock = clockIn(ts, o.locale, o.timeZone)
  const days = dayNumber(dayIn(now, o.timeZone)) - dayNumber(dayIn(ts, o.timeZone))
  if (days === 0) return `Today, ${clock}`
  if (days === 1) return `Yesterday, ${clock}`
  if (!o.exact) return date
  const sameYear = dayIn(ts, o.timeZone).slice(0, 4) === dayIn(now, o.timeZone).slice(0, 4)
  const day = new Date(ts).toLocaleDateString(o.locale, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }), timeZone: o.timeZone })
  return `${day}, ${clock}`
}

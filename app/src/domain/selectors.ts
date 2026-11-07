import { involves, myNet, overall, pairNet, paidMap, transfers, type Cents, type PersonId } from '../money'
import { currencyOr } from './currency'
import type { AppBill, AppLedger, AppState, Notif, NoteList } from './types'
import { ME } from './types'
import { mAdd, nowKey } from './util'

export const realGroups = (s: AppState) => s.ledgers.filter((l) => l.kind === 'group')
/**
 * Everyone to show for a group: its members, plus anyone who is only invited so far but already has bills or payments in
 * it (a name that was just linked to an account). Without them their station and their share would vanish until they accept.
 */
export function shownPeople(l: AppLedger): PersonId[] {
  const out = l.members.slice()
  for (const p of l.invited ?? []) if (!out.includes(p) && involves(l, p)) out.push(p)
  return out
}
export const ledgerById = (s: AppState, id: string) => s.ledgers.find((l) => l.id === id)
export const oneLedger = (s: AppState, pid: PersonId) => s.ledgers.find((l) => l.kind === 'one' && l.with === pid)
export const others = (s: AppState) => Object.keys(s.people).filter((p) => p !== ME)

/** Display name. Pass forOthers when the text will be read by someone else ("You" becomes your first name). */
export function personName(s: AppState, id: PersonId, forOthers = false): string {
  if (id === ME) return forOthers ? s.profile.name.split(' ')[0] : 'You'
  return s.people[id]?.name ?? 'Someone'
}
export const ledgerName = (s: AppState, l: AppLedger) => (l.kind === 'one' ? `1-1 with ${personName(s, l.with as PersonId)}` : l.kind === 'me' ? 'Personal' : (l.name ?? 'Group'))
/** Your own private ledger, once it has been opened for the first time. */
export const personalLedger = (s: AppState) => s.ledgers.find((l) => l.kind === 'me')
export const letterOf = (name: string) => name.charAt(0).toUpperCase()
/** What a group's bullet shows: its chosen emoji, else the first letter of its name. */
export const groupGlyph = (l: { name?: string; icon?: string }) => l.icon || letterOf(l.name ?? '?')

export function findBill(s: AppState, id: string): { bill: AppBill; ledger: AppLedger } | null {
  for (const ledger of s.ledgers) {
    const bill = ledger.bills.find((b) => b.id === id)
    if (bill) return { bill, ledger }
  }
  return null
}

export function findPayment(s: AppState, id: string) {
  for (const l of s.ledgers) {
    const p = l.payments.find((x) => x.id === id)
    if (p) return p
  }
  return null
}

// ---------- currencies ----------
/** Paper size for PDFs: the account's choice, else Letter in the USA, Canada and Mexico and A4 elsewhere. */
export function paperSize(s: AppState): 'Letter' | 'A4' {
  if (s.layout?.paper === 'Letter' || s.layout?.paper === 'A4') return s.layout.paper
  const lang = typeof navigator !== 'undefined' ? navigator.language : ''
  return /-(US|CA|MX)$/i.test(lang) ? 'Letter' : 'A4'
}

/** The currency of everything that has not chosen its own: the account's setting, dollars until it is changed. */
export const defaultCurrency = (s: AppState): string => currencyOr(s.layout?.currency)
/** The currency one group or 1-1 split is written in. */
export const currencyOf = (s: AppState, l: Pick<AppLedger, 'currency'> | null | undefined): string => currencyOr(l?.currency, defaultCurrency(s))
export const ledgerCurrency = (s: AppState, id: string | null | undefined): string => currencyOf(s, id ? ledgerById(s, id) : undefined)
/** Ledgers written in one currency. Money in different currencies is never added together. */
/** Your personal ledger is left out: nothing in it is owed to or by anyone. */
export const ledgersIn = (s: AppState, code: string): AppLedger[] => s.ledgers.filter((l) => l.kind !== 'me' && currencyOf(s, l) === code)

/**
 * The currencies worth switching between on the Groups tab: only those where something has been recorded (a bill or a
 * payment), plus your own default so there is always a way back to it. One entry or none means there is nothing to switch.
 */
export function activeCurrencies(s: AppState): string[] {
  const own = defaultCurrency(s)
  const used = new Set(s.ledgers.filter((l) => l.kind !== 'me' && (l.bills.length > 0 || l.payments.length > 0)).map((l) => currencyOf(s, l)))
  used.add(own)
  return [...used].sort((a, b) => Number(b === own) - Number(a === own) || a.localeCompare(b))
}

/** Totals for one currency (your own unless another is being viewed). Other currencies are reported by `otherTotals`. */
export const overallTotals = (s: AppState, view: string = defaultCurrency(s)) => overall(ledgersIn(s, view), ME, Object.keys(s.people))
/** What you owe and are owed in each currency other than the one being viewed, for the line under the totals. */
export function otherTotals(s: AppState, view: string = defaultCurrency(s)): { code: string; owe: Cents; owed: Cents }[] {
  const codes = [...new Set(s.ledgers.filter((l) => l.kind !== 'me').map((l) => currencyOf(s, l)))].filter((c) => c !== view)
  return codes.map((code) => ({ code, ...overall(ledgersIn(s, code), ME, Object.keys(s.people)) })).filter((x) => x.owe || x.owed)
}
export function groupTotals(l: AppLedger) {
  const n = myNet(l, ME)
  return { owe: n < 0 ? -n : 0, owed: n > 0 ? n : 0 }
}
export const pairInGroup = (l: AppLedger, p: PersonId): Cents => {
  let a = 0
  for (const t of transfers(l)) {
    if (t.from === p && t.to === ME) a += t.amt
    if (t.from === ME && t.to === p) a -= t.amt
  }
  return a
}
/** Balance with one person in one currency (the account's own unless another is asked for). */
export const pairBalance = (s: AppState, pid: PersonId, code: string = defaultCurrency(s)) => pairNet(ledgersIn(s, code), ME, pid)
/** The currencies in which you share anything with this person, the account's own first. */
export function pairCurrencies(s: AppState, pid: PersonId): string[] {
  const set = new Set(s.ledgers.filter((l) => involves(l, pid) && involves(l, ME)).map((l) => currencyOf(s, l)))
  return [...set].sort((a, b) => Number(b === defaultCurrency(s)) - Number(a === defaultCurrency(s)))
}
/** Currencies a payment with this person can be recorded in: where you share something, plus your own if there is no 1-1 split in another currency. */
export function payableCurrencies(s: AppState, pid: PersonId): string[] {
  const list = pairCurrencies(s, pid)
  const one = oneLedger(s, pid)
  const own = defaultCurrency(s)
  if (!list.includes(own) && (!one || currencyOf(s, one) === own)) list.unshift(own)
  return list
}
/** Balances with one person in the currencies other than the one being viewed (your own by default). */
export const otherPairBalances = (s: AppState, pid: PersonId, view: string = defaultCurrency(s)): { code: string; tot: Cents }[] =>
  pairCurrencies(s, pid).filter((c) => c !== view).map((code) => ({ code, tot: pairBalance(s, pid, code).tot })).filter((x) => x.tot !== 0)

export type BalanceFilter = 'net' | 'owe' | 'owed'
const passes = (f: BalanceFilter, n: Cents) => f === 'net' || (f === 'owe' && n < 0) || (f === 'owed' && n > 0)

export function filteredGroups(s: AppState, f: BalanceFilter, view: string = defaultCurrency(s)) {
  return realGroups(s).filter((g) => currencyOf(s, g) === view && passes(f, myNet(g, ME)))
}

/** People with a 1-1 ledger and money outstanding, biggest first. */
export function filteredPeople(s: AppState, f: BalanceFilter, view: string = defaultCurrency(s)) {
  return others(s)
    .filter((p) => {
      const L = oneLedger(s, p)
      return !!L && (L.bills.length > 0 || L.payments.length > 0)
    })
    .map((p) => ({ p, t: pairBalance(s, p, view).tot, others: otherPairBalances(s, p, view) }))
    // someone whose only balance is in another currency still has money outstanding
    .filter((x) => (x.t !== 0 && passes(f, x.t)) || (f === 'net' && x.t === 0 && x.others.length > 0))
    .sort((a, b) => Math.abs(b.t) - Math.abs(a.t))
}

// ---------- arranging the Groups tab ----------
/** Put items in the order the person chose. Anything they never placed keeps its default order, after the placed ones. */
export function orderBy<T>(items: T[], key: (x: T) => string, order?: string[]): T[] {
  if (!order?.length) return items
  const pos = new Map(order.map((k, i) => [k, i]))
  const placed = items.filter((x) => pos.has(key(x))).sort((a, b) => (pos.get(key(a)) as number) - (pos.get(key(b)) as number))
  return [...placed, ...items.filter((x) => !pos.has(key(x)))]
}

export const arrangedGroups = (s: AppState, f: BalanceFilter, view: string = defaultCurrency(s)) => orderBy(filteredGroups(s, f, view), (g) => g.id, s.layout?.groups)

/** How many people the list aims to show, counting settled-up ones that fill the gaps. */
export const PEOPLE_SHOWN = 5

export interface PersonRow {
  p: PersonId
  /** what they owe you (positive) or you owe them (negative), in your own currency */
  t: Cents
  /** balances with them in other currencies, when there are any */
  others?: { code: string; tot: Cents }[]
  settled: boolean
}

/**
 * People you have split with one-on-one. Anyone with money outstanding is listed, biggest first. When that leaves room,
 * the most recent settled-up people fill it (tagged "settled up") instead of vanishing. A settled person you swiped away
 * stays gone until something new happens with them. Your own drag order wins over the default.
 */
export function arrangedPeople(s: AppState, f: BalanceFilter, view: string = defaultCurrency(s)): PersonRow[] {
  const owing: PersonRow[] = filteredPeople(s, f, view).map((x) => ({ ...x, settled: false }))
  let settled: PersonRow[] = []
  if (f === 'net') {
    const dismissed = s.layout?.dismissed ?? {}
    const room = Math.max(0, PEOPLE_SHOWN - owing.length)
    settled = others(s)
      .map((p) => ({ p, L: oneLedger(s, p) }))
      .filter((x): x is { p: PersonId; L: AppLedger } => !!x.L && (x.L.bills.length > 0 || x.L.payments.length > 0))
      .filter((x) => pairBalance(s, x.p, view).tot === 0 && otherPairBalances(s, x.p, view).length === 0)
      .filter((x) => !(dismissed[x.p] && dismissed[x.p] >= lastActivity(x.L)))
      .sort((a, b) => (lastActivity(b.L) < lastActivity(a.L) ? -1 : lastActivity(b.L) > lastActivity(a.L) ? 1 : 0))
      .slice(0, room)
      .map((x) => ({ p: x.p, t: 0, settled: true }))
  }
  return orderBy([...owing, ...settled], (x) => x.p, s.layout?.people)
}

// ---------- the laptop sidebar's recent 1-1s ----------
/** Everyone you have a 1-1 split with that has something in it, most recent first, then in the order you dragged them. */
export function sideCandidates(s: AppState): PersonId[] {
  const withLedger = others(s)
    .map((p) => ({ p, L: oneLedger(s, p) }))
    .filter((x): x is { p: PersonId; L: AppLedger } => !!x.L && (x.L.bills.length > 0 || x.L.payments.length > 0))
    .sort((a, b) => (lastActivity(b.L) < lastActivity(a.L) ? -1 : lastActivity(b.L) > lastActivity(a.L) ? 1 : 0))
  return orderBy(withLedger.map((x) => x.p), (p) => p, s.layout?.people)
}
/** The few shown in the sidebar: the candidates you have not hidden from it. */
export function sidePeople(s: AppState, limit = 4): PersonId[] {
  const hidden = new Set(s.layout?.sideHidden ?? [])
  return sideCandidates(s).filter((p) => !hidden.has(p)).slice(0, limit)
}
/** How many people you hid from the sidebar (and who still exist). */
export const sideHiddenCount = (s: AppState): number => (s.layout?.sideHidden ?? []).filter((p) => s.people[p] && sideCandidates(s).includes(p)).length

// ---------- recents for the scan picker ----------
export function lastActivity(l: AppLedger): string {
  let d = ''
  for (const b of l.bills) if (b.date > d) d = b.date
  for (const p of l.payments) if (p.date > d) d = p.date
  return d
}
export function recentGroups(s: AppState, n: number) {
  return realGroups(s)
    .map((g, i) => ({ g, d: lastActivity(g), i }))
    .sort((a, b) => (b.d < a.d ? -1 : b.d > a.d ? 1 : a.i - b.i))
    .slice(0, n)
    .map((x) => x.g)
}
export function recentPeople(s: AppState, n: number) {
  const hidden = new Set(s.layout?.scanHidden ?? [])
  return others(s)
    .filter((p) => !hidden.has(p))
    .map((p, i) => ({ p, d: oneLedger(s, p) ? lastActivity(oneLedger(s, p) as AppLedger) : '', i }))
    .sort((a, b) => (b.d < a.d ? -1 : b.d > a.d ? 1 : a.i - b.i))
    .slice(0, n)
    .map((x) => x.p)
}

// ---------- group activity feed and months ----------
export type FeedItem = { k: 'b'; d: string; o: AppBill } | { k: 'p'; d: string; o: AppLedger['payments'][number] }
export function feed(l: AppLedger): FeedItem[] {
  const a: FeedItem[] = [
    ...l.bills.map((o) => ({ k: 'b' as const, d: o.date, o })),
    ...l.payments.map((o) => ({ k: 'p' as const, d: o.date, o })),
  ]
  return a.sort((x, y) => (y.d < x.d ? -1 : y.d > x.d ? 1 : 0))
}

/** Months from the earliest bill (or three months back) up to now, oldest first. */
export function monthsAsc(l: Pick<AppLedger, 'bills'>): string[] {
  let min = nowKey()
  for (const b of l.bills) if (b.date.slice(0, 7) < min) min = b.date.slice(0, 7)
  const s = mAdd(nowKey(), -2)
  if (s < min) min = s
  const out: string[] = []
  let k = min
  for (let n = 0; k <= nowKey() && n < 24; n++) {
    out.push(k)
    k = mAdd(k, 1)
  }
  return out
}

export interface MonthStats {
  tot: Cents
  n: number
  share: Record<PersonId, Cents>
  paid: Record<PersonId, Cents>
  cat: Record<string, Cents>
}
export function monthStats(l: Pick<AppLedger, 'bills'>, key: string): MonthStats {
  const r: MonthStats = { tot: 0, n: 0, share: {}, paid: {}, cat: {} }
  for (const b of l.bills) {
    if (b.date.slice(0, 7) !== key) continue
    r.n++
    r.tot += b.total
    for (const p of Object.keys(b.shares)) r.share[p] = (r.share[p] ?? 0) + b.shares[p]
    const pm = paidMap(b, b.total)
    for (const p of Object.keys(pm)) r.paid[p] = (r.paid[p] ?? 0) + pm[p]
    const c = b.cat || 'Other'
    r.cat[c] = (r.cat[c] ?? 0) + b.total
  }
  return r
}

// ---------- notes ----------
export const isDone = (n: NoteList) => n.items.length > 0 && n.items.every((x) => x.done)
export const openCount = (l: AppLedger) => l.lists.reduce((a, n) => a + n.items.filter((x) => !x.done).length, 0)
export function noteMatches(n: NoteList, q: string): boolean {
  const t = q.trim().toLowerCase()
  if (!t) return true
  return n.title.toLowerCase().includes(t) || n.memo.toLowerCase().includes(t) || n.items.some((x) => x.t.toLowerCase().includes(t))
}

export interface NoteEntry {
  n: NoteList
  ctx: 'n' | 'g'
  gid: string | null
  ledger?: AppLedger
  /** show a group tag (group list seen in Short notes) */
  tag?: boolean
}
export const noteKey = (e: NoteEntry) => (e.ctx === 'n' ? `n:${e.n.id}` : `g:${e.gid}:${e.n.id}`)

/** Every personal note plus group lists that still have open items. */
export function allNoteEntries(s: AppState): NoteEntry[] {
  const out: NoteEntry[] = s.notes.map((n) => ({ n, ctx: 'n', gid: null }))
  for (const g of realGroups(s)) {
    for (const l of g.lists) if (l.items.some((x) => !x.done)) out.push({ n: l, ctx: 'g', gid: g.id, ledger: g, tag: true })
  }
  return out
}

export type NoteFilter = 'all' | 'n' | `g:${string}`
export function noteEntries(s: AppState, ctx: 'n' | 'g', gid: string | null, q: string, filter: NoteFilter): NoteEntry[] {
  let out: NoteEntry[]
  if (ctx === 'n') out = allNoteEntries(s)
  else {
    const g = ledgerById(s, gid as string)
    out = (g?.lists ?? []).map((n) => ({ n, ctx: 'g' as const, gid, ledger: g }))
  }
  const ql = q.trim().toLowerCase()
  out = out.filter((e) => noteMatches(e.n, q) || (!!ql && !!e.ledger && (e.ledger.name ?? '').toLowerCase().includes(ql)))
  if (ctx === 'n') out = out.filter((e) => filter === 'all' || (filter === 'n' && e.ctx === 'n') || filter === `g:${e.gid}`)
  const ord = s.noteOrder
  return out.sort((a, b) => {
    const ia = ord.indexOf(noteKey(a))
    const ib = ord.indexOf(noteKey(b))
    if (ia < 0 && ib < 0) return b.n.ts - a.n.ts
    if (ia < 0) return -1
    if (ib < 0) return 1
    return ia - ib
  })
}

export const unreadCount = (s: AppState) => s.notifs.filter((n) => !n.read).length

// ---------- activity with one person ----------
/** One payment as people think of it: all the pieces recorded together added up. */
export interface MergedPayment {
  id: string
  from: PersonId
  to: PersonId
  amt: Cents
  date: string
  ts?: number
  note?: string
  img?: string | null
  /** where the pieces went, so "paid you $256.04" can say "$156.04 to the 1-1, $100.00 to Flat" */
  parts: { ledgerId: string; amt: Cents }[]
  /** who recorded it (only they can delete it) */
  by: PersonId
  /** the stored rows it is made of, so deleting it removes every piece */
  pieces: { ledgerId: string; id: string }[]
}

/**
 * A payment can be recorded across several places (the 1-1 and shared groups, plus any overpayment), but it is one
 * payment: group the pieces by the link they share and add them up.
 */
export function mergePayments(ledgers: AppLedger[], match: (p: AppLedger['payments'][number]) => boolean): MergedPayment[] {
  const out = new Map<string, MergedPayment>()
  for (const L of ledgers) {
    for (const x of L.payments) {
      if (!match(x)) continue
      const key = x.linkId ?? x.id
      const part = { ledgerId: L.id, amt: x.amt }
      const m = out.get(key)
      if (m) {
        m.amt += x.amt
        // pieces that went to the same place (a debt plus an overpayment credit) are one line
        const same = m.parts.find((q) => q.ledgerId === part.ledgerId)
        if (same) same.amt += part.amt
        else m.parts.push(part)
        m.pieces.push({ ledgerId: L.id, id: x.id })
        m.note = m.note || x.note
        m.img = m.img || x.img
        m.ts = Math.min(m.ts ?? x.ts ?? Infinity, x.ts ?? Infinity)
        if (!Number.isFinite(m.ts)) m.ts = undefined
      } else out.set(key, { id: key, from: x.from, to: x.to, amt: x.amt, date: x.date, ts: x.ts, note: x.note, img: x.img, parts: [part], by: x.by ?? ME, pieces: [{ ledgerId: L.id, id: x.id }] })
    }
  }
  return [...out.values()]
}

export type ActivityItem = { k: 'b'; d: string; ts: number; o: AppBill } | { k: 'p'; d: string; ts: number; o: MergedPayment }

/** Newest first: by the day on the bill or payment (a bill can be dated in the past), then by the moment it was added. */
function newestFirst(a: { d: string; ts: number }, b: { d: string; ts: number }) {
  return (b.d < a.d ? -1 : b.d > a.d ? 1 : 0) || b.ts - a.ts
}
/** A day with no time of its own counts as the end of that day, so it sorts after anything dated earlier. */
const stamp = (d: string, ts?: number) => ts ?? Date.parse(`${d}T12:00:00`)

/** Everything between you and one person: the bills of your 1-1 split and every payment either way. */
export function personActivity(s: AppState, pid: PersonId): ActivityItem[] {
  const L1 = oneLedger(s, pid)
  const pays = mergePayments(s.ledgers, (x) => (x.from === pid && x.to === ME) || (x.from === ME && x.to === pid))
  return [
    ...(L1?.bills ?? []).map((o) => ({ k: 'b' as const, d: o.date, ts: stamp(o.date, o.ts), o })),
    ...pays.map((o) => ({ k: 'p' as const, d: o.date, ts: stamp(o.date, o.ts), o })),
  ].sort(newestFirst)
}

/** Everything in one ledger, newest first, with the pieces of a split payment shown as one payment. */
export function ledgerActivity(l: AppLedger): ActivityItem[] {
  return [
    ...l.bills.map((o) => ({ k: 'b' as const, d: o.date, ts: stamp(o.date, o.ts), o })),
    ...mergePayments([l], () => true).map((o) => ({ k: 'p' as const, d: o.date, ts: stamp(o.date, o.ts), o })),
  ].sort(newestFirst)
}

export type ActivityKind = 'all' | 'bills' | 'payments'
export const ACTIVITY_KINDS: { value: ActivityKind; label: string }[] = [
  { value: 'all', label: 'Everything' },
  { value: 'bills', label: 'Bills only' },
  { value: 'payments', label: 'Settle-ups only' },
]
export const filterActivity = <T extends { k: 'b' | 'p' }>(items: T[], f: ActivityKind): T[] =>
  f === 'all' ? items : items.filter((x) => (f === 'bills' ? x.k === 'b' : x.k === 'p'))

/** Where an alert leads: a bill, a person (payments, 1-1 splits), or a group. Null when what it points at is gone. */
export function alertTarget(s: AppState, n: Notif): string | null {
  if (n.billId && findBill(s, n.billId)) return `/bill/${n.billId}`
  const l = n.gid ? ledgerById(s, n.gid) : undefined
  // a payment: open the person it is with, since that is where the whole payment and its note are shown
  if (n.pid && s.people[n.pid] && l) return `/person/${n.pid}`
  if (l?.kind === 'group') return `/groups/${l.id}`
  if (l?.kind === 'me') return '/personal'
  if (l?.kind === 'one' && l.with) return `/person/${l.with}`
  if (n.pid && s.people[n.pid]) return `/person/${n.pid}`
  return null
}

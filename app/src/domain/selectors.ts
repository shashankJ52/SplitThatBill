import { myNet, overall, pairNet, paidMap, transfers, type Cents, type PersonId } from '../money'
import type { AppBill, AppLedger, AppState, NoteList } from './types'
import { ME } from './types'
import { mAdd, nowKey } from './util'

export const realGroups = (s: AppState) => s.ledgers.filter((l) => l.kind === 'group')
export const ledgerById = (s: AppState, id: string) => s.ledgers.find((l) => l.id === id)
export const oneLedger = (s: AppState, pid: PersonId) => s.ledgers.find((l) => l.kind === 'one' && l.with === pid)
export const others = (s: AppState) => Object.keys(s.people).filter((p) => p !== ME)

/** Display name. Pass forOthers when the text will be read by someone else ("You" becomes your first name). */
export function personName(s: AppState, id: PersonId, forOthers = false): string {
  if (id === ME) return forOthers ? s.profile.name.split(' ')[0] : 'You'
  return s.people[id]?.name ?? 'Someone'
}
export const ledgerName = (s: AppState, l: AppLedger) => (l.kind === 'one' ? `1-1 with ${personName(s, l.with as PersonId)}` : (l.name ?? 'Group'))
export const letterOf = (name: string) => name.charAt(0).toUpperCase()

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

export const overallTotals = (s: AppState) => overall(s.ledgers, ME, Object.keys(s.people))
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
export const pairBalance = (s: AppState, pid: PersonId) => pairNet(s.ledgers, ME, pid)

export type BalanceFilter = 'net' | 'owe' | 'owed'
const passes = (f: BalanceFilter, n: Cents) => f === 'net' || (f === 'owe' && n < 0) || (f === 'owed' && n > 0)

export function filteredGroups(s: AppState, f: BalanceFilter) {
  return realGroups(s).filter((g) => passes(f, myNet(g, ME)))
}

/** People with a 1-1 ledger and money outstanding, biggest first. */
export function filteredPeople(s: AppState, f: BalanceFilter) {
  return others(s)
    .filter((p) => {
      const L = oneLedger(s, p)
      return !!L && (L.bills.length > 0 || L.payments.length > 0)
    })
    .map((p) => ({ p, t: pairBalance(s, p).tot }))
    .filter((x) => x.t !== 0 && passes(f, x.t))
    .sort((a, b) => Math.abs(b.t) - Math.abs(a.t))
}

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
  return others(s)
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

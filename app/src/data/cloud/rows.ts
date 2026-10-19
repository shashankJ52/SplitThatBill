import type { AppBill, AppLedger, AppPayment, AppState, Notif, NoteList, Person, Profile, SentReminder } from '../../domain/types'
import { ME } from '../../domain/types'

/**
 * Converting between the app's state and database rows. Pure functions, so they are easy to test.
 * Each record becomes one row: a few columns for lookups plus the whole record as `data`.
 */
export type Table = 'people' | 'ledgers' | 'bills' | 'payments' | 'notes' | 'notifs' | 'sent_reminders'

export interface Row {
  table: Table
  id: string
  /** columns other than user_id and id, including `data` */
  cols: Record<string, unknown>
}

export interface Prefs {
  note_order: string[]
  hidden: string[]
}

export interface Snapshot {
  profile: Profile
  rows: Row[]
  prefs: Prefs
}

/** What the database returns for each table (rows as plain objects). */
export interface Loaded {
  profile: Profile
  prefs: Prefs | null
  people: DbRow[]
  ledgers: DbRow[]
  bills: DbRow[]
  payments: DbRow[]
  notes: DbRow[]
  notifs: DbRow[]
  sent_reminders: DbRow[]
}
export interface DbRow {
  id: string
  kind?: string
  ledger_id?: string
  data: Record<string, unknown>
}

/**
 * Lists keep their order, but rows have no order of their own. Each record remembers a position number
 * inside its data, assigned once when first seen, so order survives a reload.
 */
export class Positions {
  private map = new Map<string, number>()
  private top = 0
  private key = (t: Table, id: string) => `${t}:${id}`
  /** Learn positions from rows just loaded. */
  learn(t: Table, id: string, pos: unknown) {
    if (typeof pos !== 'number') return
    this.map.set(this.key(t, id), pos)
    this.top = Math.max(this.top, pos)
  }
  of(t: Table, id: string): number {
    const k = this.key(t, id)
    let p = this.map.get(k)
    if (p === undefined) {
      p = ++this.top
      this.map.set(k, p)
    }
    return p
  }
  forget(t: Table, id: string) {
    this.map.delete(this.key(t, id))
  }
}

export function toSnapshot(s: AppState, pos: Positions): Snapshot {
  const rows: Row[] = []
  const add = (table: Table, id: string, extra: Record<string, unknown>, data: object) =>
    rows.push({ table, id, cols: { ...extra, data: { ...data, _pos: pos.of(table, id) } } })

  for (const p of Object.values(s.people)) if (p.id !== ME) add('people', p.id, {}, p)
  for (const l of s.ledgers) {
    const { bills, payments, id, kind, ...rest } = l
    add('ledgers', id, { kind }, rest)
    for (const b of bills) add('bills', b.id, { ledger_id: id, bill_date: b.date }, b)
    for (const p of payments) add('payments', p.id, { ledger_id: id, pay_date: p.date }, p)
  }
  for (const n of s.notes) add('notes', n.id, {}, n)
  for (const n of s.notifs) add('notifs', n.id, {}, n)
  for (const r of s.sent) add('sent_reminders', r.id, {}, r)
  return { profile: s.profile, rows, prefs: { note_order: s.noteOrder, hidden: s.hidden } }
}

const byPos = <T extends { id: string; data: Record<string, unknown> }>(rows: T[]) =>
  rows.slice().sort((a, b) => ((a.data._pos as number) ?? Infinity) - ((b.data._pos as number) ?? Infinity) || a.id.localeCompare(b.id))

const strip = <T>(data: Record<string, unknown>): T => {
  const { _pos: _ignored, ...rest } = data
  void _ignored
  return rest as T
}

export function fromLoaded(l: Loaded, pos: Positions): AppState {
  const learn = (t: Table, rows: DbRow[]) => rows.forEach((r) => pos.learn(t, r.id, r.data._pos))
  learn('people', l.people)
  learn('ledgers', l.ledgers)
  learn('bills', l.bills)
  learn('payments', l.payments)
  learn('notes', l.notes)
  learn('notifs', l.notifs)
  learn('sent_reminders', l.sent_reminders)

  const people: Record<string, Person> = { [ME]: { id: ME, name: 'You', user: true, tag: l.profile.tag } }
  for (const r of byPos(l.people)) people[r.id] = { ...strip<Person>(r.data), id: r.id }

  const ledgers: AppLedger[] = byPos(l.ledgers).map((r) => ({
    ...(strip<Omit<AppLedger, 'id' | 'kind' | 'bills' | 'payments'>>(r.data)),
    id: r.id,
    kind: r.kind as AppLedger['kind'],
    lists: ((r.data.lists as NoteList[] | undefined) ?? []),
    bills: byPos(l.bills.filter((b) => b.ledger_id === r.id)).map((b) => strip<AppBill>(b.data)),
    payments: byPos(l.payments.filter((p) => p.ledger_id === r.id)).map((p) => strip<AppPayment>(p.data)),
  }))

  return {
    v: 1,
    profile: l.profile,
    password: '',
    signedIn: true,
    people,
    ledgers,
    notifs: byPos(l.notifs).map((r) => strip<Notif>(r.data)),
    notes: byPos(l.notes).map((r) => strip<NoteList>(r.data)),
    noteOrder: l.prefs?.note_order ?? [],
    hidden: l.prefs?.hidden ?? [],
    sent: byPos(l.sent_reminders).map((r) => strip<SentReminder>(r.data)),
  }
}

// ---------- finding what changed ----------
/** JSON with sorted keys, so the same record always gives the same text. */
export function stable(v: unknown): string {
  return JSON.stringify(v, (_k, x) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : x,
  )
}

export interface Synced {
  rows: Map<string, string>
  prefs: string
  profile: string
}
export const emptySynced = (): Synced => ({ rows: new Map(), prefs: '', profile: '' })
const rk = (t: Table, id: string) => `${t}:${id}`

export interface Changes {
  upserts: Row[]
  deletes: { table: Table; id: string }[]
  prefs: Prefs | null
  profile: Profile | null
}

/** Compare a new snapshot with what the database already has. */
export function diff(prev: Synced, snap: Snapshot): Changes {
  const upserts: Row[] = []
  const seen = new Set<string>()
  for (const r of snap.rows) {
    const k = rk(r.table, r.id)
    seen.add(k)
    if (prev.rows.get(k) !== stable(r.cols)) upserts.push(r)
  }
  const deletes: Changes['deletes'] = []
  for (const k of prev.rows.keys()) {
    if (seen.has(k)) continue
    const i = k.indexOf(':')
    deletes.push({ table: k.slice(0, i) as Table, id: k.slice(i + 1) })
  }
  return {
    upserts,
    deletes,
    prefs: prev.prefs === stable(snap.prefs) ? null : snap.prefs,
    profile: prev.profile === stable(snap.profile) ? null : snap.profile,
  }
}

/** Record that a snapshot is now stored. */
export function markSynced(snap: Snapshot): Synced {
  return {
    rows: new Map(snap.rows.map((r) => [rk(r.table, r.id), stable(r.cols)])),
    prefs: stable(snap.prefs),
    profile: stable(snap.profile),
  }
}

/** The order to apply changes in so references never dangle: ledgers before their bills, bills before ledger deletes. */
export const UPSERT_ORDER: Table[] = ['people', 'ledgers', 'bills', 'payments', 'notes', 'notifs', 'sent_reminders']
export const DELETE_ORDER: Table[] = ['bills', 'payments', 'ledgers', 'people', 'notes', 'notifs', 'sent_reminders']

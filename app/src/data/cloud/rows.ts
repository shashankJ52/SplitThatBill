import type { PersonId } from '../../money/types'
import type { Layout, AppBill, AppLedger, AppPayment, AppState, JoinRequest, Notif, NoteList, Person, Profile, Role, SentReminder } from '../../domain/types'
import { ME } from '../../domain/types'

/**
 * Converting between the app's state and the shared database. Pure functions, so they are easy to test.
 *
 * The app always calls the signed-in person "you" (ME). In the database that person is their account id.
 * Everything crossing the boundary is translated, in both directions, by swapId().
 */

// ---------- what the database holds ----------
export interface GroupRow { id: string; kind: 'group' | 'one' | 'me'; name: string | null; color: string | null; icon?: string; simplify: boolean; currency?: string; owner_id: string; invite_code: string | null; created_at: string }
export interface MemberRow { group_id: string; person_id: string; user_id: string | null; display_name: string; role: Role; status: 'invited' | 'active' | 'removed' | 'left'; created_at: string; joined_at: string | null }
export interface ProfileRow { id: string; name: string; tag: string }
export interface RequestRow { group_id: string; user_id: string; created_at: string }
export interface BillRow { id: string; group_id: string; created_by: string; bill_date: string; token: string; data: Record<string, unknown>; created_at: string }
export interface CommentRow { id: string; group_id: string; bill_id: string; author_id: string; text: string; sys: boolean; created_at: string }
export interface PaymentRow { id: string; group_id: string; created_by: string; pay_date: string; data: Record<string, unknown>; created_at: string }
export interface ListRow { id: string; group_id: string; title: string; memo: string; created_at: string; updated_at: string }
export interface ListItemRow { id: string; group_id: string; list_id: string; text: string; done: boolean; done_by: string | null; position: number; created_at: string }
export interface DataRow { id: string; data: Record<string, unknown>; created_at?: string }

export interface Prefs {
  note_order: string[]
  hidden: string[]
  /** how the Groups tab is arranged */
  layout: Layout
}

/** Everything one signed-in person can see. */
export interface Loaded {
  userId: string
  profile: Profile
  prefs: Prefs | null
  groups: GroupRow[]
  members: MemberRow[]
  profiles: ProfileRow[]
  requests: RequestRow[]
  bills: BillRow[]
  comments: CommentRow[]
  payments: PaymentRow[]
  lists: ListRow[]
  listItems: ListItemRow[]
  notes: DataRow[]
  notifs: DataRow[]
  sent: DataRow[]
}

// ---------- you <-> your account id ----------
/** Replace one id with another everywhere in a value: in text values and in object keys. */
export function swapId<T>(v: T, from: string, to: string): T {
  const go = (x: unknown): unknown => {
    if (typeof x === 'string') return x === from ? to : x
    if (Array.isArray(x)) return x.map(go)
    if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x as Record<string, unknown>).map(([k, val]) => [k === from ? to : k, go(val)]))
    return x
  }
  return go(v) as T
}

const omit = <T extends object>(o: T, keys: string[]): Record<string, unknown> =>
  Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)))

// ---------- notes keep an order of their own ----------
/** Personal notes have no creation time, so each remembers a position number inside its data. */
export class Positions {
  private map = new Map<string, number>()
  private top = 0
  learn(id: string, pos: unknown) {
    if (typeof pos !== 'number') return
    this.map.set(id, pos)
    this.top = Math.max(this.top, pos)
  }
  of(id: string): number {
    let p = this.map.get(id)
    if (p === undefined) {
      p = ++this.top
      this.map.set(id, p)
    }
    return p
  }
}

// ---------- database -> app ----------
const ts = (iso: string) => Date.parse(iso) || 0
const byCreated = <T extends { created_at?: string; id?: string }>(a: T, b: T) => (a.created_at ?? '').localeCompare(b.created_at ?? '') || (a.id ?? '').localeCompare(b.id ?? '')

export function fromLoaded(l: Loaded, pos: Positions): AppState {
  const me = l.userId
  const t = <T,>(x: T): T => swapId(x, me, ME)
  const profileOf = new Map(l.profiles.map((p) => [p.id, p]))

  // everyone who ever appeared, so old bills still show names
  const people: Record<string, Person> = { [ME]: { id: ME, name: 'You', user: true, tag: l.profile.tag } }
  for (const m of l.members) {
    const pid = t(m.person_id)
    if (pid === ME) continue
    const prof = m.user_id ? profileOf.get(m.user_id) : undefined
    people[pid] = { id: pid, name: prof?.name ?? m.display_name, user: m.user_id !== null, tag: prof?.tag }
  }
  // people you found by @tag but have not put in a group or 1-1 yet: nothing in the database mentions them, so they live in your settings
  for (const f of l.prefs?.layout?.friends ?? []) {
    const pid = t(f.id)
    if (pid !== ME && !people[pid]) people[pid] = { id: pid, name: f.name, user: true, tag: f.tag }
  }
  for (const r of l.requests) {
    const prof = profileOf.get(r.user_id)
    if (prof && !people[r.user_id]) people[r.user_id] = { id: r.user_id, name: prof.name, user: true, tag: prof.tag }
  }

  const ledgers: AppLedger[] = l.groups.slice().sort(byCreated).map((g) => {
    const ms = l.members.filter((m) => m.group_id === g.id).sort(byCreated)
    const active = ms.filter((m) => m.status === 'active')
    const roles: Record<PersonId, Role> = {}
    for (const m of active) roles[t(m.person_id)] = m.role
    const mine = roles[ME]
    const isAdmin = mine === 'owner' || mine === 'admin'
    // you first, then the owner, then everyone else in the order they joined
    const rank = (m: MemberRow) => (t(m.person_id) === ME ? 0 : m.role === 'owner' ? 1 : 2)
    const memberIds = active.slice().sort((a, b) => rank(a) - rank(b) || byCreated({ created_at: a.created_at, id: a.person_id }, { created_at: b.created_at, id: b.person_id })).map((m) => t(m.person_id))
    const invited = ms.filter((m) => m.status === 'invited').map((m) => t(m.person_id))
    const former = ms.filter((m) => m.status === 'removed' || m.status === 'left').map((m) => t(m.person_id))
    const other = g.kind === 'one' ? [...memberIds, ...invited, ...former].find((p) => p !== ME) : undefined
    const requests: JoinRequest[] = isAdmin
      ? l.requests.filter((r) => r.group_id === g.id).map((r) => ({ pid: r.user_id, name: profileOf.get(r.user_id)?.name ?? 'Someone', tag: profileOf.get(r.user_id)?.tag, ts: ts(r.created_at) }))
      : []

    const bills: AppBill[] = l.bills.filter((b) => b.group_id === g.id).sort(byCreated).map((b) => ({
      ...(t(b.data) as unknown as AppBill),
      id: b.id,
      by: t(b.created_by),
      ts: ts(b.created_at),
      token: b.token,
      comments: l.comments.filter((c) => c.bill_id === b.id).sort(byCreated).map((c) => ({ id: c.id, by: t(c.author_id), text: c.text, ts: ts(c.created_at), ...(c.sys ? { sys: true } : {}) })),
    }))
    const payments: AppPayment[] = l.payments.filter((p) => p.group_id === g.id).sort(byCreated).map((p) => ({
      ...(t(p.data) as unknown as AppPayment),
      id: p.id,
      date: p.pay_date,
      by: t(p.created_by),
      ts: ts(p.created_at),
    }))
    const lists: NoteList[] = l.lists.filter((x) => x.group_id === g.id).sort(byCreated).map((x) => ({
      id: x.id,
      title: x.title,
      memo: x.memo,
      ts: ts(x.updated_at),
      items: l.listItems.filter((i) => i.list_id === x.id).sort((a, b) => a.position - b.position || byCreated(a, b)).map((i) => ({ id: i.id, t: i.text, done: i.done, doneBy: i.done_by ? t(i.done_by) : null })),
    }))

    return {
      id: g.id,
      kind: g.kind,
      ...(g.name ? { name: g.name } : {}),
      ...(g.color ? { color: g.color } : {}),
      ...(g.icon ? { icon: g.icon } : {}),
      simplify: g.simplify,
      ...(g.currency ? { currency: g.currency } : {}),
      members: memberIds,
      ...(other ? { with: other } : {}),
      owner: t(g.owner_id),
      roles,
      invited,
      former,
      inviteCode: g.invite_code,
      requests,
      bills,
      payments,
      lists,
    }
  })

  l.notes.forEach((n) => pos.learn(n.id, n.data._pos))
  const notes = l.notes.slice().sort((a, b) => ((a.data._pos as number) ?? Infinity) - ((b.data._pos as number) ?? Infinity) || a.id.localeCompare(b.id))

  return {
    v: 1,
    profile: l.profile,
    password: '',
    signedIn: true,
    people,
    ledgers,
    notifs: l.notifs.slice().sort(byCreated).map((n) => ({ ...(t(n.data) as unknown as Notif), id: n.id })),
    notes: notes.map((n) => omit(n.data, ['_pos']) as unknown as NoteList),
    noteOrder: l.prefs?.note_order ?? [],
    hidden: l.prefs?.hidden ?? [],
    layout: l.prefs?.layout ?? {},
    sent: l.sent.map((n) => ({ ...(t(n.data) as unknown as SentReminder), id: n.id })),
  }
}

// ---------- app -> database ----------
export type WriteTable = 'groups' | 'members' | 'bills' | 'comments' | 'payments' | 'lists' | 'list_items' | 'notes' | 'notifs'

export interface Row {
  table: WriteTable
  id: string
  /** the columns to write, other than the ones the database fills in itself */
  cols: Record<string, unknown>
}

export interface Snapshot {
  profile: Profile
  rows: Row[]
  prefs: Prefs
}

const iso = (ms: number) => new Date(ms).toISOString()

/**
 * The rows this person is allowed to write. Records written by other people (their bills, payments and comments)
 * and settings only admins may change are left out, so a save never tries something the database would refuse.
 */
export function toSnapshot(s: AppState, userId: string, pos: Positions): Snapshot {
  const un = <T,>(x: T): T => swapId(x, ME, userId)
  const rows: Row[] = []
  const add = (table: WriteTable, id: string, cols: Record<string, unknown>) => rows.push({ table, id, cols })
  const isUser = (p: PersonId) => p === ME || s.people[p]?.user === true

  for (const l of s.ledgers) {
    const role = l.roles?.[ME] ?? 'owner' // a group never saved before is one you own
    if (role === 'owner' || role === 'admin') {
      add('groups', l.id, { kind: l.kind, name: l.name ?? null, color: l.color ?? null, icon: l.icon ?? '', simplify: l.simplify ?? true, currency: l.currency ?? '', owner_id: userId })
    }
    // the owner row goes first: only an admin may add contacts, and the creator becomes one through this row
    if (role === 'owner') {
      add('members', `${l.id}:${userId}`, { group_id: l.id, person_id: userId, user_id: userId, display_name: s.profile.name || 'Me', role: 'owner', status: 'active' })
    }
    if (role === 'owner' || role === 'admin') {
      for (const p of l.members) {
        const person = s.people[p]
        if (p !== ME && person && !person.user) add('members', `${l.id}:${p}`, { group_id: l.id, person_id: p, user_id: null, display_name: person.name, role: 'member', status: 'active' })
      }
    }
    for (const b of l.bills) {
      if (b.by === ME) add('bills', b.id, { group_id: l.id, bill_date: b.date, token: b.token, data: un(omit(b, ['id', 'by', 'comments', 'ts'])) })
      for (const c of b.comments) {
        if (c.by === ME) add('comments', c.id, { group_id: l.id, bill_id: b.id, text: c.text, sys: !!c.sys, created_at: iso(c.ts) })
      }
    }
    for (const p of l.payments) {
      if ((p.by ?? ME) === ME) add('payments', p.id, { group_id: l.id, pay_date: p.date, data: un(omit(p, ['id', 'by', 'ts'])) })
    }
    for (const x of l.lists) {
      add('lists', x.id, { group_id: l.id, title: x.title, memo: x.memo })
      x.items.forEach((i, n) =>
        add('list_items', i.id, { group_id: l.id, list_id: x.id, text: i.t, done: i.done, done_by: i.doneBy && isUser(i.doneBy) ? un(i.doneBy) : null, position: n }),
      )
    }
  }
  for (const n of s.notes) add('notes', n.id, { data: { ...n, _pos: pos.of(n.id) } })
  for (const n of s.notifs) add('notifs', n.id, { data: un(omit(n, ['id'])) })
  return { profile: s.profile, rows, prefs: { note_order: s.noteOrder, hidden: s.hidden, layout: s.layout ?? {} } }
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
const rk = (t: WriteTable, id: string) => `${t}|${id}`
const profileKey = (p: Profile) => stable({ name: p.name, tag: p.tag }) // the email lives with the sign-in account

/** How each kind of record is written. */
export const WRITE_MODE: Record<WriteTable, 'insert-update' | 'upsert' | 'insert-only' | 'update-only'> = {
  groups: 'insert-update', // creating needs the owner; changing may be done by an admin who is not the owner
  members: 'insert-update', // only contacts, and only their name can change
  bills: 'upsert',
  lists: 'upsert',
  list_items: 'upsert',
  notes: 'upsert',
  comments: 'insert-only', // never edited
  payments: 'insert-only',
  notifs: 'update-only', // created by the database
}
/** Columns allowed in an update of an existing row. */
export const UPDATE_COLS: Partial<Record<WriteTable, string[]>> = {
  groups: ['name', 'color', 'icon', 'simplify', 'currency'],
  members: ['display_name'],
  notifs: ['data'],
}

export interface Changes {
  inserts: Row[]
  upserts: Row[]
  updates: Row[]
  deletes: { table: WriteTable; id: string }[]
  /** contacts that were taken out of a group (done with a function, since members are never deleted) */
  removedContacts: { groupId: string; personId: string }[]
  prefs: Prefs | null
  profile: Profile | null
}

export function diff(prev: Synced, snap: Snapshot): Changes {
  const out: Changes = { inserts: [], upserts: [], updates: [], deletes: [], removedContacts: [], prefs: null, profile: null }
  const seen = new Set<string>()
  for (const r of snap.rows) {
    const k = rk(r.table, r.id)
    seen.add(k)
    const before = prev.rows.get(k)
    if (before === stable(r.cols)) continue
    const mode = WRITE_MODE[r.table]
    if (mode === 'upsert') out.upserts.push(r)
    else if (before === undefined) {
      if (mode === 'insert-update' || mode === 'insert-only') out.inserts.push(r)
      // update-only rows that are new locally are ignored: only the database creates them
    } else if (mode === 'insert-update' || mode === 'update-only') out.updates.push(r)
    // insert-only rows that changed are ignored: they are never edited
  }
  for (const k of prev.rows.keys()) {
    if (seen.has(k)) continue
    const i = k.indexOf('|')
    const table = k.slice(0, i) as WriteTable
    const id = k.slice(i + 1)
    if (table === 'members') {
      const [groupId, personId] = id.split(':')
      out.removedContacts.push({ groupId, personId })
    } else out.deletes.push({ table, id })
  }
  if (prev.prefs !== stable(snap.prefs)) out.prefs = snap.prefs
  if (prev.profile !== profileKey(snap.profile)) out.profile = snap.profile
  return out
}

/** Record that a snapshot is now stored. */
export function markSynced(snap: Snapshot): Synced {
  return {
    rows: new Map(snap.rows.map((r) => [rk(r.table, r.id), stable(r.cols)])),
    prefs: stable(snap.prefs),
    profile: profileKey(snap.profile),
  }
}

/** Parents before children when writing. */
export const WRITE_ORDER: WriteTable[] = ['groups', 'members', 'bills', 'comments', 'payments', 'lists', 'list_items', 'notes', 'notifs']
/** Children before parents when deleting. */
export const DELETE_ORDER: WriteTable[] = ['list_items', 'lists', 'comments', 'payments', 'bills', 'groups', 'notes', 'notifs', 'members']

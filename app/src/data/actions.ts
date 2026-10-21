import { emptyState, seedState } from '../domain/seed'
import { nets, planPayment, splitEven, type Cents, type PersonId } from '../money'
import { ev, makeBill, item } from '../domain/bills'
import { findBill, ledgerById, noteKey, oneLedger, pairInGroup, realGroups, type NoteEntry } from '../domain/selectors'
import type { AppBill, AppLedger, AppPayment, AppState, Comment, NoteList, Notif, Profile, SentReminder } from '../domain/types'
import { ME } from '../domain/types'
import { derivedId, fmt, TAG_RE } from '../domain/util'

type S = AppState
const mapLedger = (s: S, id: string, fn: (l: AppLedger) => AppLedger): S => ({
  ...s,
  ledgers: s.ledgers.map((l) => (l.id === id ? fn(l) : l)),
})

// ---------- people ----------
export interface AddPersonResult {
  state: S
  id?: PersonId
  err?: string
}
/** Add a person by name or @usertag to a list of people. New names become local (not-on-the-app) contacts. */
export function addPersonFromInput(s: S, text: string, current: PersonId[], newId: string): AddPersonResult {
  const t = text.trim()
  if (!t) return { state: s, err: 'Enter a name or @usertag' }
  let id: PersonId | undefined
  let state = s
  if (t.startsWith('@')) {
    const tag = t.slice(1).toLowerCase()
    if (!TAG_RE.test(tag)) return { state: s, err: 'Usertags are 3–20 letters, numbers or _' }
    id = Object.keys(s.people).find((k) => s.people[k].tag?.toLowerCase() === tag)
    if (!id) return { state: s, err: `No user @${tag}. Add them by name instead.` }
  } else {
    id = Object.keys(s.people).find((k) => s.people[k].name.toLowerCase() === t.toLowerCase())
    if (!id) {
      id = newId
      state = { ...s, people: { ...s.people, [newId]: { id: newId, name: t, user: false } } }
    }
  }
  if (current.includes(id)) return { state: s, err: `${state.people[id].name} is already here` }
  return { state, id }
}

// ---------- groups and ledgers ----------
export interface GroupInput {
  id: string
  name: string
  color: string
  simplify: boolean
  members: PersonId[]
}
export function createGroup(s: S, g: GroupInput): S {
  const l: AppLedger = { id: g.id, kind: 'group', name: g.name, color: g.color, simplify: g.simplify, members: g.members, bills: [], payments: [], lists: [] }
  return { ...s, ledgers: [...s.ledgers, l] }
}
export function updateGroup(s: S, id: string, patch: Partial<Pick<GroupInput, 'name' | 'color' | 'simplify' | 'members'>>): S {
  return mapLedger(s, id, (l) => ({ ...l, ...patch }))
}
export function deleteGroup(s: S, id: string): S {
  const g = ledgerById(s, id)
  const billIds = new Set(g?.bills.map((b) => b.id) ?? [])
  return {
    ...s,
    ledgers: s.ledgers.filter((l) => l.id !== id),
    notifs: s.notifs.filter((n) => n.gid !== id && !(n.billId && billIds.has(n.billId))),
    noteOrder: s.noteOrder.filter((k) => !k.startsWith(`g:${id}:`)),
    hidden: s.hidden.filter((k) => !k.startsWith(`g:${id}:`)),
  }
}
/** A member can only be removed from a group once their balance is settled. */
export const canRemoveMember = (l: AppLedger, pid: PersonId) => (nets(l)[pid] ?? 0) === 0

export function ensureOneLedger(s: S, pid: PersonId, newId: string): { state: S; id: string } {
  const existing = oneLedger(s, pid)
  if (existing) return { state: s, id: existing.id }
  const l: AppLedger = { id: newId, kind: 'one', with: pid, members: [ME, pid], simplify: false, bills: [], payments: [], lists: [] }
  return { state: { ...s, ledgers: [...s.ledgers, l] }, id: newId }
}

// ---------- bills ----------
export const addBill = (s: S, ledgerId: string, bill: AppBill): S => mapLedger(s, ledgerId, (l) => ({ ...l, bills: [...l.bills, bill] }))

export function replaceBill(s: S, bill: AppBill): S {
  return { ...s, ledgers: s.ledgers.map((l) => (l.bills.some((b) => b.id === bill.id) ? { ...l, bills: l.bills.map((b) => (b.id === bill.id ? bill : b)) } : l)) }
}

export function deleteBill(s: S, billId: string): S {
  return {
    ...s,
    ledgers: s.ledgers.map((l) => (l.bills.some((b) => b.id === billId) ? { ...l, bills: l.bills.filter((b) => b.id !== billId) } : l)),
    notifs: s.notifs.filter((n) => n.billId !== billId),
  }
}

const mapBill = (s: S, billId: string, fn: (b: AppBill) => AppBill): S => {
  const f = findBill(s, billId)
  return f ? replaceBill(s, fn(f.bill)) : s
}
export const addComment = (s: S, billId: string, c: Comment): S => mapBill(s, billId, (b) => ({ ...b, comments: [...b.comments, c] }))
export const deleteComment = (s: S, billId: string, cid: string): S => mapBill(s, billId, (b) => ({ ...b, comments: b.comments.filter((c) => c.id !== cid) }))

// ---------- payments ----------
export const addPayment = (s: S, ledgerId: string, p: AppPayment): S => mapLedger(s, ledgerId, (l) => ({ ...l, payments: [...l.payments, p] }))

export interface PersonPaymentInput {
  id: string
  newLedgerId: string
  pid: PersonId
  direction: 'out' | 'in'
  amt: Cents
  date: string
  note?: string
  img?: string | null
  /** when it was recorded (milliseconds) */
  ts?: number
}
/** Record a payment with one person, spread over the ledgers where it clears debt (1-1 first). */
export function applyPersonPayment(s: S, p: PersonPaymentInput): { state: S; steps: { ledgerId: string; amt: Cents }[] } {
  const plan = planPayment(s.ledgers, ME, p.pid, p.direction, p.amt)
  let state = s
  const steps: { ledgerId: string; amt: Cents }[] = []
  plan.steps.forEach((step, i) => {
    let id = (step.ledger as AppLedger | null)?.id
    if (!id) {
      const r = ensureOneLedger(state, p.pid, p.newLedgerId)
      state = r.state
      id = r.id
    }
    state = addPayment(state, id, { id: derivedId(p.id, i), linkId: p.id, from: plan.from, to: plan.to, amt: step.amt, date: p.date, note: p.note, img: p.img ?? null, ...(p.ts !== undefined ? { ts: p.ts } : {}) })
    steps.push({ ledgerId: id, amt: step.amt })
  })
  return { state, steps }
}

// ---------- notes and lists ----------
type Store = { ctx: 'n' | 'g'; gid: string | null }
const storeOf = (s: S, st: Store): NoteList[] => (st.ctx === 'n' ? s.notes : (ledgerById(s, st.gid as string)?.lists ?? []))
const setStore = (s: S, st: Store, fn: (l: NoteList[]) => NoteList[]): S =>
  st.ctx === 'n' ? { ...s, notes: fn(s.notes) } : mapLedger(s, st.gid as string, (l) => ({ ...l, lists: fn(l.lists) }))
const storeFromDest = (dest: string): Store => (dest === 'n' ? { ctx: 'n', gid: null } : { ctx: 'g', gid: dest.slice(2) })

/** Save a note or list. If it moves between "Just me" and a group (or between groups), it is moved. */
export function saveNote(s: S, note: NoteList, from: Store | null, dest: string): S {
  const to = storeFromDest(dest)
  const same = !!from && from.ctx === to.ctx && from.gid === to.gid
  let state = s
  if (from && !same) {
    const old = storeOf(s, from).find((n) => n.id === note.id)
    state = setStore(state, from, (l) => l.filter((n) => n.id !== note.id))
    if (old) state = { ...state, noteOrder: state.noteOrder.filter((k) => k !== noteKey({ n: old, ctx: from.ctx, gid: from.gid })) }
  }
  return setStore(state, to, (l) => (same && l.some((n) => n.id === note.id) ? l.map((n) => (n.id === note.id ? note : n)) : [...l, note]))
}
export const deleteNote = (s: S, st: Store, id: string): S => ({
  ...setStore(s, st, (l) => l.filter((n) => n.id !== id)),
  noteOrder: s.noteOrder.filter((k) => k !== (st.ctx === 'n' ? `n:${id}` : `g:${st.gid}:${id}`)),
  hidden: s.hidden.filter((k) => k !== (st.ctx === 'n' ? `n:${id}` : `g:${st.gid}:${id}`)),
})
export const toggleNoteItem = (s: S, st: Store, noteId: string, itemId: string, by: PersonId): S =>
  setStore(s, st, (l) =>
    l.map((n) => (n.id === noteId ? { ...n, items: n.items.map((x) => (x.id === itemId ? { ...x, done: !x.done, doneBy: !x.done ? by : null } : x)) } : n)),
  )
export const moveNoteToTop = (s: S, key: string): S => ({ ...s, noteOrder: [key, ...s.noteOrder.filter((k) => k !== key)] })
/** Save a dragged order for the visible notes, keeping the order of notes that were not visible. */
export const setNoteOrder = (s: S, keys: string[]): S => ({ ...s, noteOrder: [...keys, ...s.noteOrder.filter((k) => !keys.includes(k))] })
export const toggleNoteHidden = (s: S, key: string): S => ({ ...s, hidden: s.hidden.includes(key) ? s.hidden.filter((k) => k !== key) : [...s.hidden, key] })

// ---------- alerts ----------
export const toggleRead = (s: S, id: string): S => ({ ...s, notifs: s.notifs.map((n) => (n.id === id ? { ...n, read: !n.read } : n)) })
export const markRead = (s: S, id: string): S => ({ ...s, notifs: s.notifs.map((n) => (n.id === id ? { ...n, read: true } : n)) })
export const markAllRead = (s: S): S => ({ ...s, notifs: s.notifs.map((n) => ({ ...n, read: true })) })
export function dismissNotif(s: S, id: string): { state: S; removed?: Notif; index: number } {
  const index = s.notifs.findIndex((n) => n.id === id)
  if (index < 0) return { state: s, index }
  return { state: { ...s, notifs: s.notifs.filter((n) => n.id !== id) }, removed: s.notifs[index], index }
}
export function restoreNotif(s: S, n: Notif, index: number): S {
  const list = s.notifs.slice()
  list.splice(Math.min(index, list.length), 0, n)
  return { ...s, notifs: list }
}
export const dismissAll = (s: S): { state: S; removed: Notif[] } => ({ state: { ...s, notifs: [] }, removed: s.notifs })
export const restoreAll = (s: S, removed: Notif[]): S => ({ ...s, notifs: [...removed, ...s.notifs] })
export const pushNotif = (s: S, n: Notif): S => ({ ...s, notifs: [...s.notifs, n] })

export const sendReminder = (s: S, r: SentReminder): S => ({ ...s, sent: [...s.sent, r] })

// ---------- profile ----------
export const setProfile = (s: S, patch: Partial<Profile>): S => {
  const profile = { ...s.profile, ...patch }
  return { ...s, profile, people: { ...s.people, [ME]: { ...s.people[ME], tag: profile.tag } } }
}
export const setPassword = (s: S, password: string): S => ({ ...s, password })

// ---------- demo helpers (until real friends exist) ----------
/** James adds a small bill to the first group you share with him. */
export function demoFriendAddsBill(s: S, ids: { bill: string; notif: string }, date: string, now: number): { state: S; ok: boolean } {
  const g = realGroups(s).find((x) => x.members.includes('james') && x.members.includes(ME))
  if (!g) return { state: s, ok: false }
  const people = g.members.slice()
  const b = makeBill({ id: ids.bill, title: 'Corner Deli', date, payer: 'james', by: 'james', rt: 6000, people, cat: 'Eating out', items: [item(1, 'Sandwiches', 6000, ev(people.slice()))] })
  const mine = splitEven(6000, people.length)[people.indexOf(ME)] ?? 0
  const state = pushNotif(addBill(s, g.id, b), { id: ids.notif, text: `James added Corner Deli to ${g.name}`, sub: `You owe ${fmt(mine)}`, ts: now, read: false, billId: b.id })
  return { state, ok: true }
}
/** A friend on the app sends you a reminder for something you owe them. */
export function demoFriendReminder(s: S, id: string, now: number): { state: S; from?: PersonId } {
  for (const g of realGroups(s)) {
    for (const p of g.members) {
      if (p === ME || !s.people[p]?.user) continue
      const a = pairInGroup(g, p)
      if (a < 0) {
        const msg = `Hey @${s.profile.tag} 👋 quick, friendly nudge: you owe me ${fmt(-a)} for ${g.name}. No rush at all, whenever works for you. Thanks!`
        const n: Notif = { id, kind: 'remind', from: p, gid: g.id, text: `${s.people[p].name} sent you a reminder`, sub: `${g.name} · ${fmt(-a)}`, msg, ts: now, read: false }
        return { state: pushNotif(s, n), from: p }
      }
    }
  }
  return { state: s }
}

export type { NoteEntry }

// ---------- session and account (local stand-ins until the backend exists) ----------
export const signOut = (s: S): S => ({ ...s, signedIn: false })
export const signIn = (s: S): S => ({ ...s, signedIn: true })
/** A brand-new account starts empty. */
export const createAccount = (profile: Profile, password: string): S => emptyState(profile, password)
/** Replace everything with the sample story, keeping who is signed in. */
export const reloadSample = (s: S, now: number): S => ({ ...seedState(now), profile: s.profile, password: s.password, signedIn: s.signedIn })
/** Wipe groups, people, alerts and notes but keep the account. */
export const clearAllData = (s: S): S => ({ ...emptyState(s.profile, s.password), signedIn: s.signedIn })

// ---------- how the Groups tab is arranged ----------
export const setGroupOrder = (s: S, ids: string[]): S => ({ ...s, layout: { ...s.layout, groups: ids } })
export const setPeopleOrder = (s: S, ids: PersonId[]): S => ({ ...s, layout: { ...s.layout, people: ids } })
/** Swipe a settled-up person away. They return when there is new activity with them. */
export const dismissPerson = (s: S, pid: PersonId, date: string): S => ({ ...s, layout: { ...s.layout, dismissed: { ...s.layout?.dismissed, [pid]: date } } })
export function undismissPerson(s: S, pid: PersonId): S {
  const { [pid]: _gone, ...rest } = s.layout?.dismissed ?? {}
  void _gone
  return { ...s, layout: { ...s.layout, dismissed: rest } }
}

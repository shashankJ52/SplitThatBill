import { describe, expect, it } from 'vitest'
import { makeBill } from '../../domain/bills'
import type { AppLedger, AppState } from '../../domain/types'
import { ME } from '../../domain/types'
import { emptyState } from '../../domain/seed'
import { uid } from '../../domain/util'
import { diff, emptySynced, fromLoaded, markSynced, Positions, stable, swapId, toSnapshot, type Loaded } from './rows'

const USER = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const profile = { name: 'Ann Lee', email: 'ann@example.com', tag: 'ann' }

describe('swapping you and your account id', () => {
  it('replaces ids in text values and object keys, everywhere, without touching anything else', () => {
    const v = { by: ME, even: [ME, 'x'], shares: { [ME]: 5, x: 6 }, note: 'me and you', nested: { p: [{ id: ME }] } }
    const out = swapId(v, ME, USER)
    expect(out).toEqual({ by: USER, even: [USER, 'x'], shares: { [USER]: 5, x: 6 }, note: 'me and you', nested: { p: [{ id: USER }] } })
    expect(swapId(out, USER, ME)).toEqual(v)
  })
})

function ledger(over: Partial<AppLedger> = {}): AppLedger {
  return { id: uid(), kind: 'group', name: 'Flat', color: '#0039A6', simplify: true, members: [ME], bills: [], payments: [], lists: [], ...over }
}
const state = (ledgers: AppLedger[], extra: Partial<AppState> = {}): AppState => ({ ...emptyState(profile, ''), ledgers, ...extra })

describe('what a save writes', () => {
  it('a new group writes the group and you as its owner, and contacts as members', () => {
    const sam = uid()
    const l = ledger({ members: [ME, sam] })
    const s = state([l], { people: { ...emptyState(profile, '').people, [sam]: { id: sam, name: 'Sam', user: false } } })
    const rows = toSnapshot(s, USER, new Positions()).rows
    expect(rows.map((r) => r.table)).toEqual(['groups', 'members', 'members'])
    expect(rows[1].id).toBe(`${l.id}:${USER}`) // the owner row comes before any contact
    const owner = rows.find((r) => r.id === `${l.id}:${USER}`)
    expect(owner?.cols).toMatchObject({ role: 'owner', status: 'active', person_id: USER })
    expect(rows.find((r) => r.id === `${l.id}:${sam}`)?.cols).toMatchObject({ display_name: 'Sam' })
  })
  it('bills are written with you swapped for your id, and comments become their own rows', () => {
    const b = makeBill({ id: uid(), title: 'Pizza', date: '2026-10-20', payer: ME, by: ME, rt: 1000, people: [ME], items: [{ id: 1, name: 'x', qty: 1, price: 1000, a: { mode: 'even', even: [ME], por: {} } }], comments: [{ id: uid(), by: ME, text: 'hi', ts: 1_700_000_000_000 }] })
    const l = ledger({ bills: [b] })
    const rows = toSnapshot(state([l]), USER, new Positions()).rows
    const bill = rows.find((r) => r.table === 'bills')!
    const data = bill.cols.data as Record<string, unknown>
    expect(JSON.stringify(data)).toContain(USER)
    expect(JSON.stringify(data)).not.toContain('"me"')
    expect(data.comments).toBeUndefined()
    expect(data.by).toBeUndefined()
    expect(data.id).toBeUndefined()
    expect(rows.find((r) => r.table === 'comments')?.cols).toMatchObject({ text: 'hi', bill_id: b.id, created_at: '2023-11-14T22:13:20.000Z' })
  })
  it("someone else's bills, comments and payments are never written", () => {
    const mine = makeBill({ id: uid(), title: 'Mine', date: '2026-10-20', payer: ME, by: ME, rt: 100, people: [ME], items: [] })
    const theirs = makeBill({ id: uid(), title: 'Theirs', date: '2026-10-20', payer: OTHER, by: OTHER, rt: 100, people: [ME, OTHER], items: [], comments: [{ id: uid(), by: OTHER, text: 'x', ts: 1 }, { id: uid(), by: ME, text: 'mine', ts: 2 }] })
    const l = ledger({ roles: { [ME]: 'member', [OTHER]: 'owner' }, bills: [mine, theirs], payments: [{ id: uid(), from: ME, to: OTHER, amt: 5, date: '2026-10-20' }, { id: uid(), from: OTHER, to: ME, amt: 5, date: '2026-10-20', by: OTHER }] })
    const rows = toSnapshot(state([l]), USER, new Positions()).rows
    expect(rows.filter((r) => r.table === 'bills').map((r) => r.id)).toEqual([mine.id])
    expect(rows.filter((r) => r.table === 'comments').map((r) => (r.cols as { text: string }).text)).toEqual(['mine'])
    expect(rows.filter((r) => r.table === 'payments')).toHaveLength(1)
  })
  it('a plain member does not write group settings; an admin does; only the owner writes the owner row', () => {
    const member = toSnapshot(state([ledger({ roles: { [ME]: 'member' } })]), USER, new Positions()).rows
    expect(member).toEqual([])
    const admin = toSnapshot(state([ledger({ roles: { [ME]: 'admin' } })]), USER, new Positions()).rows
    expect(admin.map((r) => r.table)).toEqual(['groups'])
    const owner = toSnapshot(state([ledger({ roles: { [ME]: 'owner' } })]), USER, new Positions()).rows
    expect(owner.map((r) => r.table)).toEqual(['groups', 'members'])
  })
  it('a checklist tick by a contact is not tied to an account', () => {
    const sam = uid()
    const l = ledger({ members: [ME, sam], lists: [{ id: uid(), title: 'Costco', memo: '', ts: 1, items: [{ id: uid(), t: 'a', done: true, doneBy: sam }, { id: uid(), t: 'b', done: true, doneBy: ME }] }] })
    const s = state([l], { people: { ...emptyState(profile, '').people, [sam]: { id: sam, name: 'Sam', user: false } } })
    const items = toSnapshot(s, USER, new Positions()).rows.filter((r) => r.table === 'list_items')
    expect(items.map((r) => r.cols.done_by)).toEqual([null, USER])
  })
})

describe('finding changes', () => {
  const base = () => {
    const b = makeBill({ id: uid(), title: 'Pizza', date: '2026-10-20', payer: ME, by: ME, rt: 100, people: [ME], items: [], comments: [{ id: uid(), by: ME, text: 'hi', ts: 1 }] })
    return state([ledger({ bills: [b], roles: { [ME]: 'owner' } })], { notifs: [{ id: uid(), text: 'n', sub: '', ts: 1, read: false }] })
  }
  it('sends nothing when nothing changed, and everything the first time', () => {
    const s = base()
    const pos = new Positions()
    const snap = toSnapshot(s, USER, pos)
    const same = diff(markSynced(snap), toSnapshot(s, USER, pos))
    expect([same.inserts, same.upserts, same.updates, same.deletes, same.removedContacts]).toEqual([[], [], [], [], []])
    expect(same.prefs).toBeNull()
    const first = diff(emptySynced(), snap)
    // notifications are never created by the app, so they are not in the first write
    expect(first.inserts.map((r) => r.table).sort()).toEqual(['comments', 'groups', 'members'])
    expect(first.upserts.map((r) => r.table)).toEqual(['bills'])
  })
  it('changed rows are updates (groups) or upserts (bills); comments are never edited', () => {
    const s = base()
    const pos = new Positions()
    const synced = markSynced(toSnapshot(s, USER, pos))
    const l = s.ledgers[0]
    const edited: AppState = { ...s, ledgers: [{ ...l, name: 'Renamed', bills: l.bills.map((b) => ({ ...b, notes: 'x', comments: [{ ...b.comments[0], text: 'edited' }] })) }] }
    const c = diff(synced, toSnapshot(edited, USER, pos))
    expect(c.updates.map((r) => r.table)).toEqual(['groups'])
    expect(c.upserts.map((r) => r.table)).toEqual(['bills'])
    expect(c.inserts).toEqual([])
  })
  it('read marks on alerts are updates; dismissed alerts are deletes; contacts taken out are function calls', () => {
    const s = base()
    const pos = new Positions()
    const sam = uid()
    const withSam: AppState = { ...s, people: { ...s.people, [sam]: { id: sam, name: 'Sam', user: false } }, ledgers: [{ ...s.ledgers[0], members: [ME, sam] }] }
    const synced = markSynced(toSnapshot(withSam, USER, pos))
    const next: AppState = { ...withSam, notifs: [{ ...withSam.notifs[0], read: true }], ledgers: [{ ...withSam.ledgers[0], members: [ME] }] }
    const c = diff(synced, toSnapshot(next, USER, pos))
    expect(c.updates.map((r) => r.table)).toEqual(['notifs'])
    expect(c.removedContacts).toEqual([{ groupId: s.ledgers[0].id, personId: sam }])
    const gone = diff(synced, toSnapshot({ ...withSam, notifs: [] }, USER, pos))
    expect(gone.deletes.map((d) => d.table)).toEqual(['notifs'])
  })
  it('does not treat reordered keys as a change; profile email changes are ignored', () => {
    expect(stable({ b: 1, a: { d: 1, c: 2 } })).toBe(stable({ a: { c: 2, d: 1 }, b: 1 }))
    const s = base()
    const pos = new Positions()
    const synced = markSynced(toSnapshot(s, USER, pos))
    expect(diff(synced, toSnapshot({ ...s, profile: { ...s.profile, email: 'new@x.co' } }, USER, pos)).profile).toBeNull()
    expect(diff(synced, toSnapshot({ ...s, profile: { ...s.profile, name: 'New' } }, USER, pos)).profile?.name).toBe('New')
  })
})

describe('people you found by @tag', () => {
  const loaded = (friends?: { id: string; name: string; tag?: string }[]): Loaded => ({
    userId: USER, profile, prefs: friends ? { note_order: [], hidden: [], layout: { friends } } : null, groups: [], members: [], profiles: [], requests: [],
    bills: [], comments: [], payments: [], lists: [], listItems: [], notes: [], notifs: [], sent: [],
  })

  it('are still known after a reload, even when they are in no group or 1-1 yet (they used to turn into "Someone")', () => {
    const s = fromLoaded(loaded([{ id: OTHER, name: 'Sumit', tag: 'sumitgamer' }]), new Positions())
    expect(s.people[OTHER]).toEqual({ id: OTHER, name: 'Sumit', user: true, tag: 'sumitgamer' })
  })

  it('nobody is invented when none were found, and you are never listed as a friend', () => {
    expect(Object.keys(fromLoaded(loaded(), new Positions()).people)).toEqual([ME])
    expect(Object.keys(fromLoaded(loaded([{ id: USER, name: 'Ann' }]), new Positions()).people)).toEqual([ME])
  })

  it('what a group says about someone wins over the remembered copy', () => {
    const gid = uid()
    const l: Loaded = {
      ...loaded([{ id: OTHER, name: 'Old Name', tag: 'old' }]),
      groups: [{ id: gid, kind: 'group', name: 'Flat', color: null, simplify: true, owner_id: USER, invite_code: null, created_at: '2026-10-20T00:00:00Z' }],
      members: [{ group_id: gid, person_id: OTHER, user_id: OTHER, display_name: 'Sumit R', role: 'member', status: 'active', invited_by: null, created_at: '2026-10-20T00:00:01Z' } as never],
      profiles: [{ id: OTHER, name: 'Sumit R', tag: 'sumitgamer' } as never],
    }
    expect(fromLoaded(l, new Positions()).people[OTHER]).toMatchObject({ name: 'Sumit R', tag: 'sumitgamer' })
  })
})

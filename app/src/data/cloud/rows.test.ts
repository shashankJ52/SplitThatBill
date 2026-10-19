import { describe, expect, it } from 'vitest'
import { seedState } from '../../domain/seed'
import { emptySynced, diff, fromLoaded, markSynced, Positions, stable, toSnapshot, type DbRow, type Loaded, type Snapshot } from './rows'

const now = Date.UTC(2026, 9, 19, 12)
const base = () => seedState(now)

/** Pretend to be the database: turn a snapshot's rows into what a select would return. */
function pretendLoad(snap: Snapshot): Loaded {
  const pick = (t: string): DbRow[] =>
    snap.rows.filter((r) => r.table === t).map((r) => ({ id: r.id, kind: r.cols.kind as string | undefined, ledger_id: r.cols.ledger_id as string | undefined, data: JSON.parse(JSON.stringify(r.cols.data)) }))
  return {
    profile: snap.profile, prefs: snap.prefs,
    people: pick('people'), ledgers: pick('ledgers'), bills: pick('bills'), payments: pick('payments'),
    notes: pick('notes'), notifs: pick('notifs'), sent_reminders: pick('sent_reminders'),
  }
}

describe('state to rows and back', () => {
  it('round-trips the whole sample state, order included', () => {
    const s = base()
    const back = fromLoaded(pretendLoad(toSnapshot(s, new Positions())), new Positions())
    expect({ ...back, password: s.password, signedIn: s.signedIn }).toEqual(s)
  })
  it('keeps money, shares and comments exactly', () => {
    const s = base()
    const back = fromLoaded(pretendLoad(toSnapshot(s, new Positions())), new Positions())
    const bills = (x: typeof s) => x.ledgers.flatMap((l) => l.bills)
    expect(bills(back).map((b) => [b.id, b.total, b.shares, b.comments.length])).toEqual(bills(s).map((b) => [b.id, b.total, b.shares, b.comments.length]))
  })
  it('preserves order after a reload even when ids sort differently', () => {
    const s = base()
    const rev = { ...s, ledgers: s.ledgers.slice().reverse() }
    const back = fromLoaded(pretendLoad(toSnapshot(rev, new Positions())), new Positions())
    expect(back.ledgers.map((l) => l.id)).toEqual(rev.ledgers.map((l) => l.id))
  })
  it('puts every bill and payment under its own ledger', () => {
    const snap = toSnapshot(base(), new Positions())
    const ledgerIds = new Set(snap.rows.filter((r) => r.table === 'ledgers').map((r) => r.id))
    for (const r of snap.rows.filter((x) => x.table === 'bills' || x.table === 'payments')) expect(ledgerIds.has(r.cols.ledger_id as string)).toBe(true)
  })
  it('never stores "you" as a person row or the password anywhere', () => {
    const snap = toSnapshot(base(), new Positions())
    expect(snap.rows.some((r) => r.table === 'people' && r.id === 'me')).toBe(false)
    expect(JSON.stringify(snap)).not.toContain(base().password)
  })
})

describe('positions', () => {
  it('new records go at the end and positions are remembered', () => {
    const pos = new Positions()
    const a = pos.of('notes', 'a')
    const b = pos.of('notes', 'b')
    expect(b).toBeGreaterThan(a)
    expect(pos.of('notes', 'a')).toBe(a)
    const loaded = new Positions()
    loaded.learn('notes', 'x', 41)
    expect(loaded.of('notes', 'new')).toBe(42)
  })
})

describe('finding changes', () => {
  it('sends nothing when nothing changed', () => {
    const pos = new Positions()
    const s = base() // one state: every seedState call makes fresh random share tokens
    const c = diff(markSynced(toSnapshot(s, pos)), toSnapshot(s, pos))
    expect(c.upserts).toEqual([])
    expect(c.deletes).toEqual([])
    expect(c.prefs).toBeNull()
    expect(c.profile).toBeNull()
  })
  it('sends everything the first time', () => {
    const snap = toSnapshot(base(), new Positions())
    const c = diff(emptySynced(), snap)
    expect(c.upserts).toHaveLength(snap.rows.length)
    expect(c.profile).not.toBeNull()
  })
  it('sends only the one bill that changed', () => {
    const pos = new Positions()
    const s = base()
    const synced = markSynced(toSnapshot(s, pos))
    const l = s.ledgers[0]
    const edited = { ...s, ledgers: [{ ...l, bills: l.bills.map((b, i) => (i === 0 ? { ...b, notes: 'edited' } : b)) }, ...s.ledgers.slice(1)] }
    const c = diff(synced, toSnapshot(edited, pos))
    expect(c.upserts.map((r) => [r.table, r.id])).toEqual([['bills', l.bills[0].id]])
  })
  it('does not treat reordered keys as a change', () => {
    expect(stable({ b: 1, a: { d: 1, c: 2 } })).toBe(stable({ a: { c: 2, d: 1 }, b: 1 }))
  })
  it('deletes what was removed, bills before their ledger', () => {
    const pos = new Positions()
    const s = base()
    const synced = markSynced(toSnapshot(s, pos))
    const gone = s.ledgers[0]
    const c = diff(synced, toSnapshot({ ...s, ledgers: s.ledgers.slice(1) }, pos))
    expect(c.deletes.some((d) => d.table === 'ledgers' && d.id === gone.id)).toBe(true)
    expect(c.deletes.filter((d) => d.table === 'bills')).toHaveLength(gone.bills.length)
  })
  it('detects profile and prefs changes', () => {
    const pos = new Positions()
    const s = base()
    const synced = markSynced(toSnapshot(s, pos))
    const c = diff(synced, toSnapshot({ ...s, profile: { ...s.profile, name: 'New' }, hidden: ['n:x'] }, pos))
    expect(c.profile?.name).toBe('New')
    expect(c.prefs?.hidden).toEqual(['n:x'])
  })
})

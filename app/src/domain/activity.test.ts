import { describe, expect, it } from 'vitest'
import { makeBill } from './bills'
import { emptyState } from './seed'
import * as S from './selectors'
import type { AppLedger, AppState, Notif } from './types'
import { ME } from './types'

const AMY = 'amy'
const profile = { name: 'Me', email: 'm@x.co', tag: 'me' }
const bill = (id: string, date: string, ts?: number, total = 1000) =>
  makeBill({ id, title: id, date, ts, payer: ME, by: ME, rt: total, people: [ME, AMY], items: [{ id: 1, name: 'x', qty: 1, price: total, a: { mode: 'even', even: [ME, AMY], por: {} } }] })

const oneToOne = (over: Partial<AppLedger> = {}): AppLedger => ({ id: 'o', kind: 'one', with: AMY, members: [ME, AMY], simplify: false, bills: [], payments: [], lists: [], roles: { [ME]: 'owner', [AMY]: 'member' }, ...over })
const stateOf = (...ledgers: AppLedger[]): AppState => ({ ...emptyState(profile, ''), ledgers, people: { [ME]: { id: ME, name: 'You', user: true }, [AMY]: { id: AMY, name: 'Amy', user: true, tag: 'amy' } } })

describe('one payment recorded in pieces is shown as one payment', () => {
  const pieces = [
    { id: 'p0', linkId: 'L', from: AMY, to: ME, amt: 15604, date: '2026-10-21', ts: 2000, note: 'Zelle 4821', img: 'data:image/png;base64,AAAA' },
    { id: 'p1', linkId: 'L', from: AMY, to: ME, amt: 10000, date: '2026-10-21', ts: 2000, note: 'Zelle 4821', img: 'data:image/png;base64,AAAA' },
  ]
  it('adds the pieces up and keeps the note and proof', () => {
    const m = S.mergePayments([oneToOne({ payments: pieces })], () => true)
    expect(m).toHaveLength(1)
    expect(m[0]).toMatchObject({ amt: 25604, note: 'Zelle 4821', img: 'data:image/png;base64,AAAA', from: AMY, to: ME })
    // both pieces went to the same 1-1, so they are one line in the breakdown
    expect(m[0].parts).toEqual([{ ledgerId: 'o', amt: 25604 }])
  })
  it('across a 1-1 and a group it still adds up and says where each piece went', () => {
    const g: AppLedger = { ...oneToOne({ id: 'g', kind: 'group', with: undefined }), payments: [{ ...pieces[1], id: 'pg' }] }
    const o = oneToOne({ payments: [pieces[0]] })
    const act = S.personActivity(stateOf(o, g), AMY).filter((x) => x.k === 'p')
    expect(act).toHaveLength(1)
    expect((act[0].o as S.MergedPayment).amt).toBe(25604)
    expect((act[0].o as S.MergedPayment).parts.map((x) => x.ledgerId).sort()).toEqual(['g', 'o'])
  })
  it('two separate payments stay two, and other people\'s payments are left out', () => {
    const separate = [{ ...pieces[0], linkId: 'A' }, { ...pieces[1], linkId: 'B' }, { id: 'x', from: 'someone', to: ME, amt: 1, date: '2026-10-21' }]
    const act = S.personActivity(stateOf(oneToOne({ payments: separate })), AMY).filter((x) => x.k === 'p')
    expect(act.map((x) => (x.o as S.MergedPayment).amt).sort()).toEqual([10000, 15604])
  })
})

describe('activity order and filter', () => {
  const s = stateOf(oneToOne({
    bills: [bill('old', '2026-10-10'), bill('new', '2026-10-20', Date.parse('2026-10-20T09:00:00'))],
    payments: [{ id: 'p', from: AMY, to: ME, amt: 500, date: '2026-10-20', ts: Date.parse('2026-10-20T18:30:00') }],
  }))
  it('is newest first, using the time when it is known and the day when it is not', () => {
    expect(S.personActivity(s, AMY).map((x) => x.o.id)).toEqual(['p', 'new', 'old'])
  })
  it('shows everything, only bills, or only settle-ups', () => {
    const all = S.personActivity(s, AMY)
    expect(S.filterActivity(all, 'all')).toHaveLength(3)
    expect(S.filterActivity(all, 'bills').map((x) => x.o.id)).toEqual(['new', 'old'])
    expect(S.filterActivity(all, 'payments').map((x) => x.o.id)).toEqual(['p'])
  })
  it('a group has the same activity and filter', () => {
    const g = oneToOne({ id: 'g', kind: 'group', with: undefined, bills: [bill('b', '2026-10-20')], payments: [{ id: 'p', from: AMY, to: ME, amt: 1, date: '2026-10-20' }] })
    expect(S.ledgerActivity(g).map((x) => x.k).sort()).toEqual(['b', 'p'])
    expect(S.filterActivity(S.ledgerActivity(g), 'payments').map((x) => x.k)).toEqual(['p'])
  })
})

describe('where an alert leads', () => {
  const note = (over: Partial<Notif>): Notif => ({ id: 'n', text: 't', sub: '', ts: 1, read: false, ...over })
  it('a payment alert in a 1-1 split opens the person (this was "That item no longer exists")', () => {
    const s = stateOf(oneToOne())
    expect(S.alertTarget(s, note({ gid: 'o' }))).toBe('/person/amy')
    expect(S.alertTarget(s, note({ gid: 'o', pid: AMY }))).toBe('/person/amy')
  })
  it('a group alert opens the group, a bill alert opens the bill', () => {
    const g = oneToOne({ id: 'g', kind: 'group', with: undefined, bills: [bill('b1', '2026-10-20')] })
    const s = stateOf(g)
    expect(S.alertTarget(s, note({ gid: 'g' }))).toBe('/groups/g')
    expect(S.alertTarget(s, note({ gid: 'g', billId: 'b1' }))).toBe('/bill/b1')
  })
  it('is null when what it pointed at is gone', () => {
    expect(S.alertTarget(stateOf(), note({ gid: 'gone' }))).toBeNull()
    expect(S.alertTarget(stateOf(), note({ billId: 'gone', gid: 'gone' }))).toBeNull()
  })
})

describe('the group feed is ordered by the date on the bill', () => {
  it('puts a bill dated in an older month below newer months even if it was added just now', () => {
    const old = bill('old', '2026-04-10', 9_000_000_000_000) // dated April, added most recently
    const recent = bill('recent', '2026-10-20', 1_000)
    const sameDayEarly = bill('early', '2026-10-20', 500)
    const feed = S.ledgerActivity(oneToOne({ bills: [old, sameDayEarly, recent] })).map((x) => x.o.id)
    expect(feed).toEqual(['recent', 'early', 'old'])
  })
})

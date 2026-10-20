import { describe, expect, it } from 'vitest'
import * as A from '../data/actions'
import { makeBill } from './bills'
import { seedState } from './seed'
import * as S from './selectors'
import { pairNet } from '../money'
import { ME } from './types'

const s0 = seedState(1_800_000_000_000)
const owed = (s: typeof s0, p: string) => S.pairBalance(s, p).tot
/** Settle everything with one person the way the Record payment sheet does. */
const settle = (s: typeof s0, p: string) => {
  const t = owed(s, p)
  return A.applyPersonPayment(s, { id: `pay-${p}`, newLedgerId: `o-${p}`, pid: p, direction: t > 0 ? 'in' : 'out', amt: Math.abs(t), date: '2026-10-20' }).state
}

describe('ordering by your own drag order', () => {
  const items = ['a', 'b', 'c', 'd']
  it('placed items first in your order, the rest keep their default order after them', () => {
    expect(S.orderBy(items, (x) => x, ['c', 'a'])).toEqual(['c', 'a', 'b', 'd'])
  })
  it('ignores ids that no longer exist and leaves the default when nothing was placed', () => {
    expect(S.orderBy(items, (x) => x, ['gone', 'b'])).toEqual(['b', 'a', 'c', 'd'])
    expect(S.orderBy(items, (x) => x, [])).toBe(items)
    expect(S.orderBy(items, (x) => x, undefined)).toBe(items)
  })
  it('orders groups', () => {
    expect(S.arrangedGroups(s0, 'net').map((g) => g.id)).toEqual(['g1', 'g2'])
    expect(S.arrangedGroups(A.setGroupOrder(s0, ['g2', 'g1']), 'net').map((g) => g.id)).toEqual(['g2', 'g1'])
  })
})

describe('people who are settled up', () => {
  it('stay listed, tagged settled, instead of disappearing', () => {
    const s = settle(s0, 'james')
    expect(owed(s, 'james')).toBe(0)
    const rows = S.arrangedPeople(s, 'net')
    expect(rows.find((r) => r.p === 'james')).toMatchObject({ settled: true, t: 0 })
    expect(rows.find((r) => r.p === 'sam')?.settled).toBe(false)
  })
  it('come after the people who owe, with the biggest balances first', () => {
    const rows = S.arrangedPeople(settle(s0, 'james'), 'net')
    const firstSettled = rows.findIndex((r) => r.settled)
    expect(rows.slice(0, firstSettled).every((r) => !r.settled)).toBe(true)
  })
  it('only fill the gaps: a long list of balances pushes them out', () => {
    expect(S.PEOPLE_SHOWN).toBe(5)
    let s = settle(s0, 'james') // james is now settled; sam still owes
    // three more people who owe you: five in all with money outstanding
    for (const n of ['p1', 'p2', 'p3']) {
      s = { ...s, people: { ...s.people, [n]: { id: n, name: n, user: false } } }
      const oid = `o-${n}`
      s = A.ensureOneLedger(s, n, oid).state
      s = A.addBill(s, oid, makeBill({ id: `b-${n}`, title: 't', date: '2026-10-20', payer: ME, by: ME, rt: 1000, people: [ME, n], items: [{ id: 1, name: 'x', qty: 1, price: 1000, a: { mode: 'even', even: [ME, n], por: {} } }] }))
    }
    const rows = S.arrangedPeople(s, 'net')
    expect(rows.filter((r) => !r.settled)).toHaveLength(4) // sam + three new
    expect(rows.some((r) => r.settled)).toBe(true) // one gap left: james fits
    s = A.addBill(s, 'o-p1', makeBill({ id: 'b-extra', title: 't', date: '2026-10-20', payer: ME, by: ME, rt: 1000, people: [ME, 'p1'], items: [] }))
    // a fifth person who owes you fills the last place, so the settled one is pushed out
    s = { ...s, people: { ...s.people, p4: { id: 'p4', name: 'p4', user: false } } }
    s = A.ensureOneLedger(s, 'p4', 'o-p4').state
    s = A.addBill(s, 'o-p4', makeBill({ id: 'b-p4', title: 't', date: '2026-10-20', payer: ME, by: ME, rt: 1000, people: [ME, 'p4'], items: [{ id: 1, name: 'x', qty: 1, price: 1000, a: { mode: 'even', even: [ME, 'p4'], por: {} } }] }))
    const full = S.arrangedPeople(s, 'net')
    expect(full.filter((r) => !r.settled)).toHaveLength(5)
    expect(full.some((r) => r.settled)).toBe(false)
    expect(full.length).toBe(5)
  })
  it('only show with the Net filter; You owe and Owed list only real balances', () => {
    const s = settle(s0, 'james')
    expect(S.arrangedPeople(s, 'owed').every((r) => !r.settled)).toBe(true)
    expect(S.arrangedPeople(s, 'owe').every((r) => !r.settled)).toBe(true)
  })
  it('swiped away, they stay gone', () => {
    const s = A.dismissPerson(settle(s0, 'james'), 'james', '2026-10-21')
    expect(S.arrangedPeople(s, 'net').some((r) => r.p === 'james')).toBe(false)
  })
  it('come back when something new happens with them, even after being dismissed', () => {
    let s = A.dismissPerson(settle(s0, 'james'), 'james', '2026-10-21')
    // a new payment later than the dismissal: they are settled still, but there is new activity
    s = A.applyPersonPayment(s, { id: 'later', newLedgerId: 'o9', pid: 'james', direction: 'in', amt: 100, date: '2026-10-25' }).state
    const row = S.arrangedPeople(s, 'net').find((r) => r.p === 'james')
    expect(row).toBeDefined()
    // and a balance always shows, whatever was dismissed before
    const owing = A.dismissPerson(s0, 'james', '2099-01-01')
    expect(S.arrangedPeople(owing, 'net').some((r) => r.p === 'james' && !r.settled)).toBe(true)
  })
  it('can be restored after an undo', () => {
    const s = A.undismissPerson(A.dismissPerson(settle(s0, 'james'), 'james', '2026-10-21'), 'james')
    expect(S.arrangedPeople(s, 'net').some((r) => r.p === 'james')).toBe(true)
    expect(s.layout?.dismissed).toEqual({})
  })
  it('follow your drag order over the default', () => {
    const base = S.arrangedPeople(s0, 'net').map((r) => r.p)
    const flipped = [...base].reverse()
    expect(S.arrangedPeople(A.setPeopleOrder(s0, flipped), 'net').map((r) => r.p)).toEqual(flipped)
  })
})

describe('the layout does not disturb money', () => {
  it('totals are unchanged by ordering or dismissing', () => {
    const before = S.overallTotals(s0)
    const s = A.dismissPerson(A.setGroupOrder(A.setPeopleOrder(s0, ['sam', 'james']), ['g2', 'g1']), 'sam', '2026-10-21')
    expect(S.overallTotals(s)).toEqual(before)
    expect(pairNet(s.ledgers as never, ME, 'james').tot).toBe(pairNet(s0.ledgers as never, ME, 'james').tot)
  })
})

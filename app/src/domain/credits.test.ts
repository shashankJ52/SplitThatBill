import { describe, expect, it } from 'vitest'
import { creditLines, myNet, nets } from '../money'
import { addCredit, billWithCredit, canContinue, draftFromBill, grandTotal, newDraft, removeCredit, setCreditMode, setCreditName, setCreditValue, toBill } from './draft'
import { makeBill } from './bills'
import { seedState } from './seed'
import type { AppLedger, Comment } from './types'
import { ME } from './types'

const s0 = seedState(Date.UTC(2026, 9, 19, 12))
const ids = { id: 'b_new', token: 'tok', date: '2026-10-19' }
const note: Comment = { id: 'c1', by: ME, text: 'added', ts: 1, sys: true }

const dinner = (over: Partial<Parameters<typeof makeBill>[0]> = {}) =>
  makeBill({
    id: 'b1', title: 'Dinner', date: '2026-10-20', payer: ME, by: ME, rt: 9000, people: [ME, 'james', 'sam'],
    items: [{ id: 1, name: 'Food', qty: 1, price: 9000, a: { mode: 'even', even: [ME, 'james', 'sam'], por: {} } }], ...over,
  })
const ledgerOf = (b: ReturnType<typeof dinner>): AppLedger => ({ id: 'g', kind: 'group', name: 'Flat', simplify: true, members: [ME, 'james', 'sam'], bills: [b], payments: [], lists: [] })

describe('extra discounts on a bill being built', () => {
  const base = () => newDraft(s0, ids, 'g:g1')

  it('start empty, add a row, and change its name, type and value', () => {
    let d = base()
    expect(d.credits).toEqual([])
    d = addCredit(d)
    expect(d.credits).toEqual([{ id: 1, name: 'Cashback', m: 'pct', v: 0 }])
    d = setCreditName(d, 1, 'Zomato coupon')
    const r = setCreditValue(d, 1, 40)
    expect(r.err).toBeUndefined()
    d = setCreditMode(r.d, 1, 'amt')
    expect(d.credits[0]).toMatchObject({ name: 'Zomato coupon', m: 'amt', v: 0 }) // switching starts the value again
  })

  it('refuse a value that is not a sensible percent or amount', () => {
    const d = addCredit(base())
    expect(setCreditValue(d, 1, 0).err).toMatch(/percent/)
    expect(setCreditValue(d, 1, 101).err).toMatch(/percent/)
    expect(setCreditValue(setCreditMode(d, 1, 'amt'), 1, -5).err).toMatch(/amount/)
  })

  it('lower the grand total, and are not part of the receipt check', () => {
    let d = base()
    const before = grandTotal(d)
    d = setCreditValue(addCredit(d), 1, 10).d
    expect(grandTotal(d)).toBe(before - Math.round((d.rt * 10) / 100))
    expect(canContinue(d, 'review')).toBe(true) // the receipt still adds up
    expect(removeCredit(d, 1).credits).toEqual([])
  })

  it('are saved with the bill, minus any left empty, and a blank name becomes "Discount"', () => {
    let d = base()
    d = setCreditValue(addCredit(d), 1, 25).d
    d = setCreditName(d, 1, '   ')
    d = addCredit(d) // never given a value
    const b = toBill(d)
    expect(b.credits).toEqual([{ id: 1, name: 'Discount', m: 'pct', v: 25 }])
    expect(toBill(base()).credits).toBeUndefined() // a bill without any keeps its old shape
  })
})

describe('adding a discount to a bill that is already saved', () => {
  it('lowers the total and everyone’s share in proportion, keeps the receipt as printed, and says what changed', () => {
    const b = dinner()
    const out = billWithCredit(b, ledgerOf(b), { name: 'Cashback', m: 'pct', v: 40 }, note)
    expect(out.rt).toBe(9000)
    expect(out.total).toBe(5400)
    expect(Object.values(out.shares)).toEqual([1800, 1800, 1800])
    expect(creditLines(out)[0]).toMatchObject({ amt: 3600, credit: { name: 'Cashback', id: 1 } })
    expect(out.comments.at(-1)).toBe(note)
    expect(b.credits).toBeUndefined() // the original is untouched
  })

  it('changes what people owe the one who paid, so balances come down with it', () => {
    const b = dinner()
    const before = myNet(ledgerOf(b), 'james')
    const l2 = ledgerOf(billWithCredit(b, ledgerOf(b), { name: 'Cashback', m: 'pct', v: 40 }, note))
    expect(before).toBe(-3000)
    expect(myNet(l2, 'james')).toBe(-1800)
    expect(Object.values(nets(l2)).reduce((a, v) => a + v, 0)).toBe(0)
  })

  it('a second discount adds to the first, and they come off the same receipt total', () => {
    const b = dinner()
    const one = billWithCredit(b, ledgerOf(b), { name: 'Coupon', m: 'amt', v: 1000 }, note)
    const two = billWithCredit(one, ledgerOf(one), { name: 'Cashback', m: 'pct', v: 10 }, note)
    expect(creditLines(two).map((l) => [l.credit.id, l.amt])).toEqual([[1, 1000], [2, 900]])
    expect(two.total).toBe(7100)
  })

  it('when several people paid, what each paid comes down so the payments add up to the new total', () => {
    const b = dinner({ payer: ME, paid: { [ME]: 6000, james: 3000 } })
    const out = billWithCredit(b, ledgerOf(b), { name: 'Cashback', m: 'pct', v: 10 }, note)
    expect(out.total).toBe(8100)
    expect(out.paid && Object.values(out.paid).reduce((a, v) => a + v, 0)).toBe(8100)
    expect(out.paid).toEqual({ [ME]: 5400, james: 2700 })
  })

  it('cannot take the bill below nothing', () => {
    const b = dinner()
    const out = billWithCredit(b, ledgerOf(b), { name: 'Huge', m: 'amt', v: 999999 }, note)
    expect(out.total).toBe(0)
    expect(Object.values(out.shares)).toEqual([])
    expect(draftFromBill(out, ledgerOf(out)).credits).toHaveLength(1)
  })
})

describe('a new bill in a group with someone invited', () => {
  it('includes them, so they are still part of the group until they accept', () => {
    const s = seedState(Date.UTC(2026, 9, 19, 12))
    const g = s.ledgers.find((l) => l.id === 'g1')!
    const withInvite = { ...s, ledgers: s.ledgers.map((l) => (l.id === 'g1' ? { ...l, invited: ['sumit'] } : l)), people: { ...s.people, sumit: { id: 'sumit', name: 'Sumit', user: true, tag: 'sumit' } } }
    const d = newDraft(withInvite, { id: 'b', token: 't', date: '2026-10-19' }, 'g:g1')
    expect(d.people).toEqual([...g.members, 'sumit'])
    expect(newDraft(s, { id: 'b', token: 't', date: '2026-10-19' }, 'g:g1').people).toEqual(g.members)
  })
})

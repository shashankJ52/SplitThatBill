import { describe, expect, it } from 'vitest'
import * as A from '../data/actions'
import { draftFromBill, newDraft, setTarget, toBill } from './draft'
import { activeCurrencies, monthStats, otherTotals, overallTotals, personalLedger, realGroups, ledgerName, alertTarget } from './selectors'
import { seedState } from './seed'
import { ME } from './types'

const s0 = seedState(Date.UTC(2026, 9, 19, 12))
const ids = { id: 'b_me', token: 'tok', date: '2026-10-19' }

describe('the personal ledger', () => {
  it('is made once, whoever asks', () => {
    expect(personalLedger(s0)).toBeUndefined()
    const a = A.ensurePersonal(s0, 'p1')
    const b = A.ensurePersonal(a.state, 'p2')
    expect(b.id).toBe('p1')
    expect(b.state.ledgers.filter((l) => l.kind === 'me')).toHaveLength(1)
  })

  it('is not a group and does not show among them', () => {
    const { state } = A.ensurePersonal(s0, 'p1')
    expect(realGroups(state).some((g) => g.id === 'p1')).toBe(false)
    expect(ledgerName(state, personalLedger(state)!)).toBe('Personal')
    expect(alertTarget(state, { id: 'n', text: '', ts: 0, read: false, gid: 'p1' } as never)).toBe('/personal')
  })

  it('a bill for it puts everything on you, with nobody to split or pay back', () => {
    const { state } = A.ensurePersonal(s0, 'p1')
    const d = setTarget(state, newDraft(state, ids, 'me'), 'me')
    expect(d.personal).toBe(true)
    expect(d.gid).toBe('p1')
    expect(d.people).toEqual([ME])
    const bill = toBill({ ...d, items: [...d.items, { id: 99, name: 'Added later', qty: 1, price: 500, a: { mode: 'even', even: [], por: {} } }], rt: d.rt + 500 })
    expect(bill.items.every((i) => i.a.even.includes(ME))).toBe(true)
    expect(bill.shares[ME]).toBe(bill.total)
  })

  it('what you spent in a month adds up your bills', () => {
    const { state, id } = A.ensurePersonal(s0, 'p1')
    const d = newDraft(state, ids, 'me')
    const bill = toBill(d)
    const s1 = A.addBill(state, id, bill)
    expect(monthStats(personalLedger(s1)!, '2026-10').tot).toBe(bill.total)
    expect(monthStats(personalLedger(s1)!, '2026-09').tot).toBe(0)
  })

  it('editing a personal bill keeps it personal', () => {
    const { state, id } = A.ensurePersonal(s0, 'p1')
    const bill = toBill(newDraft(state, ids, 'me'))
    const l = personalLedger(A.addBill(state, id, bill))!
    const d = draftFromBill(bill, l)
    expect(d.personal).toBe(true)
    expect(d.gid).toBe('p1')
    expect(d.target).toBe('me')
  })

  it('splits for a group are untouched', () => {
    const d = newDraft(s0, ids, 'g:g1')
    expect(d.personal).toBe(false)
    expect(d.people.length).toBeGreaterThan(1)
  })

  it('never counts towards what you owe, are owed or your net', () => {
    const before = overallTotals(s0)
    const { state, id } = A.ensurePersonal(s0, 'p1')
    const withBill = A.addBill(state, id, toBill(newDraft(state, ids, 'me')))
    expect(overallTotals(withBill)).toEqual(before)
    // not even from a personal ledger written in another currency
    const euro = { ...withBill, ledgers: withBill.ledgers.map((l) => (l.kind === 'me' ? { ...l, currency: 'EUR' } : l)) }
    expect(overallTotals(euro, 'EUR')).toEqual({ owe: 0, owed: 0 })
    expect(otherTotals(euro)).toEqual(otherTotals(s0))
    expect(activeCurrencies(euro)).toEqual(activeCurrencies(s0))
  })
})

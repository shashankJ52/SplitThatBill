import { describe, expect, it } from 'vitest'
import * as A from '../data/actions'
import { makeBill } from './bills'
import { draftCurrency, newDraft } from './draft'
import { emptyState } from './seed'
import * as S from './selectors'
import { ME, type AppLedger, type AppState } from './types'
import { fmt } from './util'

const AMY = 'amy'
const profile = { name: 'Me', email: 'm@x.co', tag: 'me' }
const bill = (id: string, total: number) =>
  makeBill({ id, title: id, date: '2026-10-20', ts: 1, payer: ME, by: ME, rt: total, people: [ME, AMY], items: [{ id: 1, name: 'x', qty: 1, price: total, a: { mode: 'even', even: [ME, AMY], por: {} } }] })
const led = (id: string, kind: 'group' | 'one', currency: string | undefined, total: number): AppLedger => ({
  id, kind, name: kind === 'group' ? id : undefined, with: kind === 'one' ? AMY : undefined, members: [ME, AMY], simplify: false, currency,
  bills: [bill(`b-${id}`, total)], payments: [], lists: [], roles: { [ME]: 'owner', [AMY]: 'member' },
})
const stateOf = (ledgers: AppLedger[], currency?: string): AppState => ({
  ...emptyState(profile, ''), ledgers, layout: currency ? { currency } : undefined,
  people: { [ME]: { id: ME, name: 'You', user: true }, [AMY]: { id: AMY, name: 'Amy', user: true, tag: 'amy' } },
})

describe('which currency applies', () => {
  it('is dollars until the account chooses another', () => {
    expect(S.defaultCurrency(stateOf([]))).toBe('USD')
    expect(S.defaultCurrency(stateOf([], 'EUR'))).toBe('EUR')
  })
  it('a ledger with its own currency keeps it; one without follows the account', () => {
    const s = stateOf([led('trip', 'group', 'EUR', 10000), led('flat', 'group', undefined, 10000)], 'GBP')
    expect(S.ledgerCurrency(s, 'trip')).toBe('EUR')
    expect(S.ledgerCurrency(s, 'flat')).toBe('GBP')
  })
  it('an unknown code from outside falls back to the default', () => {
    expect(S.ledgerCurrency(stateOf([led('x', 'group', 'XXX', 100)]), 'x')).toBe('USD')
  })
})

describe('money in different currencies is never added together', () => {
  // Amy owes me 50 in the flat (USD) and 80 on the trip (EUR)
  const s = stateOf([led('flat', 'group', 'USD', 10000), led('trip', 'group', 'EUR', 16000)])
  it('the Groups totals cover only the account currency, and the rest is reported per currency', () => {
    expect(S.overallTotals(s)).toEqual({ owe: 0, owed: 5000 })
    expect(S.otherTotals(s)).toEqual([{ code: 'EUR', owe: 0, owed: 8000 }])
  })
  it('a balance with one person is per currency', () => {
    expect(S.pairBalance(s, AMY).tot).toBe(5000)
    expect(S.pairBalance(s, AMY, 'EUR').tot).toBe(8000)
    expect(S.pairCurrencies(s, AMY)).toEqual(['USD', 'EUR'])
    expect(S.otherPairBalances(s, AMY)).toEqual([{ code: 'EUR', tot: 8000 }])
  })
  it('the people list shows someone whose only balance is in another currency', () => {
    const only = stateOf([led('o', 'one', 'EUR', 4000)])
    const rows = S.arrangedPeople(only, 'net')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ p: AMY, t: 0, settled: false, others: [{ code: 'EUR', tot: 2000 }] })
  })
  it('switching the account currency makes the other one the "other"', () => {
    const eur = stateOf(s.ledgers, 'EUR')
    expect(S.overallTotals(eur)).toEqual({ owe: 0, owed: 8000 })
    expect(S.otherTotals(eur)).toEqual([{ code: 'USD', owe: 0, owed: 5000 }])
  })
})

describe('recording a payment in one currency', () => {
  const s = stateOf([led('flat', 'group', 'USD', 10000), led('trip', 'group', 'EUR', 16000)])
  it('only touches ledgers in that currency', () => {
    const r = A.applyPersonPayment(s, { id: 'p1', newLedgerId: 'n', pid: AMY, direction: 'in', amt: 8000, date: '2026-10-21', currency: 'EUR' })
    expect(r.steps).toEqual([{ ledgerId: 'trip', amt: 8000 }])
    expect(S.pairBalance(r.state, AMY, 'EUR').tot).toBe(0)
    expect(S.pairBalance(r.state, AMY, 'USD').tot).toBe(5000)
    expect(r.state.ledgers.find((l) => l.id === 'flat')?.payments).toHaveLength(0)
  })
  it('defaults to the account currency', () => {
    const r = A.applyPersonPayment(s, { id: 'p1', newLedgerId: 'n', pid: AMY, direction: 'in', amt: 5000, date: '2026-10-21' })
    expect(r.steps).toEqual([{ ledgerId: 'flat', amt: 5000 }])
  })
  it('a leftover in a currency with no 1-1 split goes to a shared group when the 1-1 is in another currency', () => {
    const t = stateOf([led('one', 'one', 'USD', 2000), led('trip', 'group', 'EUR', 16000)])
    const r = A.applyPersonPayment(t, { id: 'p1', newLedgerId: 'n', pid: AMY, direction: 'in', amt: 9000, date: '2026-10-21', currency: 'EUR' })
    expect(r.steps).toEqual([{ ledgerId: 'trip', amt: 8000 }, { ledgerId: 'trip', amt: 1000 }])
    // no second 1-1 split was created
    expect(r.state.ledgers.filter((l) => l.kind === 'one')).toHaveLength(1)
  })
  it('offers the currencies you can pay in', () => {
    expect(S.payableCurrencies(s, AMY)).toEqual(['USD', 'EUR'])
    // a 1-1 in euros and an account in dollars: dollars cannot be offered, since the one 1-1 split is euros
    expect(S.payableCurrencies(stateOf([led('o', 'one', 'EUR', 100)]), AMY)).toEqual(['EUR'])
    // nothing shared yet: the account currency
    expect(S.payableCurrencies(stateOf([]), AMY)).toEqual(['USD'])
  })
})

describe('creating and changing currencies', () => {
  it('a new group and a new 1-1 split are stamped with the account currency at that moment', () => {
    let s = stateOf([], 'EUR')
    s = A.createGroup(s, { id: 'g', name: 'G', color: '#000000', simplify: true, members: [ME] })
    s = A.ensureOneLedger(s, AMY, 'o').state
    expect(s.ledgers.map((l) => l.currency)).toEqual(['EUR', 'EUR'])
    s = A.setDefaultCurrency(s, 'GBP')
    expect(s.ledgers.map((l) => l.currency)).toEqual(['EUR', 'EUR'])
  })
  it('changing the account currency does not re-label what never chose one', () => {
    const s = A.setDefaultCurrency(stateOf([led('old', 'group', undefined, 100)], 'USD'), 'EUR')
    expect(S.ledgerCurrency(s, 'old')).toBe('USD')
    expect(S.defaultCurrency(s)).toBe('EUR')
  })
  it('an admin can set one group to euros without touching the others', () => {
    const s = A.setLedgerCurrency(stateOf([led('a', 'group', 'USD', 100), led('b', 'group', 'USD', 100)]), 'a', 'EUR')
    expect(s.ledgers.map((l) => l.currency)).toEqual(['EUR', 'USD'])
  })
})

describe('a bill in progress', () => {
  it('is written in the currency of the group it is going to', () => {
    const s = stateOf([led('trip', 'group', 'EUR', 100)], 'USD')
    const d = newDraft(s, { id: 'd', token: 't', date: '2026-10-21' }, 'g:trip')
    expect(draftCurrency(s, d)).toBe('EUR')
  })
  it('uses the account currency for someone you have no 1-1 split with yet', () => {
    const s = stateOf([], 'GBP')
    expect(draftCurrency(s, newDraft(s, { id: 'd', token: 't', date: '2026-10-21' }, `p:${AMY}`))).toBe('GBP')
  })
  it('writes amounts with the right symbol', () => {
    expect(fmt(1250, 'EUR')).toBe('€\u00a012.50')
  })
})

describe('switching the currency shown on the Groups tab', () => {
  const s = stateOf([led('flat', 'group', 'USD', 10000), led('trip', 'group', 'INR', 16000), led('empty', 'group', 'EUR', 0)])
  // the empty euro group has a bill with no amount; make it truly empty
  const t: AppState = { ...s, ledgers: s.ledgers.map((l) => (l.id === 'empty' ? { ...l, bills: [] } : l)) }

  it('offers only currencies where something was recorded, your own first', () => {
    expect(S.activeCurrencies(t)).toEqual(['USD', 'INR'])
  })
  it('offers nothing to switch when only one currency is in use', () => {
    expect(S.activeCurrencies(stateOf([led('flat', 'group', 'USD', 100)]))).toEqual(['USD'])
    expect(S.activeCurrencies(stateOf([]))).toEqual(['USD'])
  })
  it('keeps your own currency as a way back even if nothing was recorded in it', () => {
    expect(S.activeCurrencies(stateOf([led('trip', 'group', 'INR', 100)], 'USD'))).toEqual(['USD', 'INR'])
  })
  it('a payment alone makes a currency count', () => {
    const p = stateOf([{ ...led('trip', 'group', 'EUR', 0), bills: [], payments: [{ id: 'p', from: AMY, to: ME, amt: 100, date: '2026-10-20' }] }])
    expect(S.activeCurrencies(p)).toEqual(['USD', 'EUR'])
  })
  it('totals, groups and people follow the viewed currency', () => {
    expect(S.overallTotals(t, 'INR')).toEqual({ owe: 0, owed: 8000 })
    expect(S.otherTotals(t, 'INR')).toEqual([{ code: 'USD', owe: 0, owed: 5000 }])
    expect(S.arrangedGroups(t, 'net', 'INR').map((g) => g.id)).toEqual(['trip'])
    expect(S.arrangedGroups(t, 'net').map((g) => g.id)).toEqual(['flat'])
    expect(S.arrangedGroups(t, 'net', 'EUR').map((g) => g.id)).toEqual(['empty'])
    // people are the ones you split 1-1 with: Amy has a dollar 1-1 split, so in rupees her balance is the trip and dollars are "other"
    const withOne: AppState = { ...t, ledgers: [...t.ledgers, led('one', 'one', 'USD', 2000)] }
    expect(S.arrangedPeople(withOne, 'net', 'INR')[0]).toMatchObject({ p: AMY, t: 8000, others: [{ code: 'USD', tot: 6000 }] })
    expect(S.arrangedPeople(withOne, 'net')[0]).toMatchObject({ p: AMY, t: 6000, others: [{ code: 'INR', tot: 8000 }] })
  })
})

describe('the currency picked while building a split', () => {
  it('is used for someone you have no 1-1 split with yet, and the 1-1 split of an existing one wins', () => {
    const s = stateOf([], 'USD')
    const d = { ...newDraft(s, { id: 'd', token: 't', date: '2026-10-21' }, `p:${AMY}`), currency: 'GBP' }
    expect(draftCurrency(s, d)).toBe('GBP')
    const withOne = stateOf([led('o', 'one', 'EUR', 100)], 'USD')
    const d2 = { ...newDraft(withOne, { id: 'd', token: 't', date: '2026-10-21' }, `p:${AMY}`), currency: 'GBP' }
    expect(draftCurrency(withOne, d2)).toBe('EUR')
  })
  it('becomes the currency of the new 1-1 split when it is created', () => {
    const r = A.ensureOneLedger(stateOf([], 'USD'), AMY, 'o', 'GBP')
    expect(r.state.ledgers[0].currency).toBe('GBP')
  })
})

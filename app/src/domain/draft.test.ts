import { describe, expect, it } from 'vitest'
import { calc } from '../money'
import {
  acceptSum, addDiscount, addExtra, addItem, applyWhole, canContinue, defaultTarget, draftFromBill, newDraft, paidRest, porStep, removeItem,
  reconciles, setDiscountValue, setFee, setItemMode, setItemPe, setItemPrice, setItemQty, setPayer, setPaid, setTarget, startManual,
  stepGuest, toBill, toggleEven, unassigned, wholeFromDraft, grandTotal, type Draft,
} from './draft'
import { seedState } from './seed'

const s = seedState(Date.UTC(2026, 9, 19, 12))
const ids = { id: 'b_new', token: 'tok', date: '2026-10-19' }
const fresh = (want?: string) => newDraft(s, ids, want)
const must = (r: { d: Draft; err?: string }) => {
  expect(r.err).toBeUndefined()
  return r.d
}

describe('new draft', () => {
  it('defaults to the most recent group and loads the sample receipt', () => {
    const d = fresh()
    expect(d.kind).toBe('group')
    expect(d.people.length).toBeGreaterThan(1)
    expect(d.items).toHaveLength(7)
    expect(reconciles(d)).toBe(true)
  })
  it('honours a requested group, person, or falls back', () => {
    expect(defaultTarget(s, 'g:g2')).toBe('g:g2')
    expect(defaultTarget(s, 'p:james')).toBe('p:james')
    expect(defaultTarget(s, 'g:nope')).toMatch(/^g:/)
    expect(defaultTarget(s, 'p:me')).toMatch(/^g:/)
  })
  it('a 1-1 target has two people; changing target clears assignments', () => {
    let d = toggleEven(fresh('g:g1'), 1, 'me')
    expect(d.items[0].a.even).toEqual(['me'])
    d = setTarget(s, d, 'p:james')
    expect(d.kind).toBe('one')
    expect(d.people).toEqual(['me', 'james'])
    expect(d.items[0].a.even).toEqual([])
  })
})

describe('items', () => {
  const manual = () => startManual(fresh())
  it('adds with quantity and the all/each price rule', () => {
    let d = must(addItem(manual(), { name: 'Cola', qty: 2, price: 700, each: false }))
    expect(d.items[0].price).toBe(700)
    d = must(addItem(d, { name: 'Beer', qty: 3, price: 600, each: true }))
    expect(d.items[1]).toMatchObject({ price: 1800, pe: 'each', unit: 600 })
    expect(d.rt).toBe(2500)
  })
  it('rejects bad quantity and price, and names unnamed items', () => {
    const m = manual()
    expect(addItem(m, { name: 'x', qty: 0, price: 100, each: false }).err).toBeTruthy()
    expect(addItem(m, { name: 'x', qty: 100, price: 100, each: false }).err).toBeTruthy()
    expect(addItem(m, { name: 'x', qty: 1.5, price: 100, each: false }).err).toBeTruthy()
    expect(addItem(m, { name: 'x', qty: 1, price: 0, each: false }).err).toBeTruthy()
    expect(must(addItem(m, { name: '  ', qty: 1, price: 100, each: false })).items[0].name).toBe('Item 1')
  })
  it('changing quantity keeps "each" pricing consistent and resets portions', () => {
    let d = must(addItem(manual(), { name: 'Beer', qty: 3, price: 600, each: true }))
    d = setItemMode(toggleEven(d, 1, 'me'), 1, 'por')
    d = must(setItemQty(d, 1, 4))
    expect(d.items[0].price).toBe(2400)
    expect(d.items[0].a).toEqual({ mode: 'even', even: [], por: {} })
    d = must(setItemQty(d, 1, 1))
    expect(d.items[0].pe).toBeUndefined()
    expect(setItemQty(d, 1, 0).err).toBeTruthy()
  })
  it('switching to each rounds an uneven total and says so', () => {
    const d = must(addItem(manual(), { name: 'x', qty: 3, price: 1000, each: false }))
    const r = setItemPe(d, 1, 'each')
    expect(r.rounded).toBe(333)
    expect(r.d.items[0].price).toBe(999)
    expect(setItemPe(r.d, 1, 'total').d.items[0].pe).toBeUndefined()
  })
  it('editing a price follows the each/total mode', () => {
    let d = must(addItem(manual(), { name: 'Beer', qty: 3, price: 600, each: true }))
    d = setItemPrice(d, 1, 700)
    expect(d.items[0]).toMatchObject({ unit: 700, price: 2100 })
  })
  it('manual totals follow items, tax, tip and discount; scanned totals do not', () => {
    let d = must(addItem(manual(), { name: 'a', qty: 1, price: 10000, each: false }))
    d = setFee(setFee(d, 'tax', 800), 'tip', 1200)
    expect(d.rt).toBe(12000)
    d = addDiscount(d)
    d = must(setDiscountValue(d, 10))
    expect(d.rt).toBe(10800)
    expect(removeItem(d, 1).rt).toBe(1800) // tax and tip remain, less 10% off
    const scanned = setFee(fresh(), 'tax', 0)
    expect(scanned.rt).toBe(15040)
    expect(reconciles(scanned)).toBe(false)
    expect(reconciles(acceptSum(scanned))).toBe(true)
  })
  it('validates discount values', () => {
    const d = addDiscount(fresh())
    expect(setDiscountValue(d, 0).err).toBeTruthy()
    expect(setDiscountValue(d, 101).err).toBeTruthy()
    expect(setDiscountValue(d, 100).err).toBeUndefined()
  })
})

describe('assigning', () => {
  it('portions start from the even group and must sum to the quantity', () => {
    let d = fresh('g:g1')
    const beer = d.items.find((i) => i.name === 'Beer')!
    for (const p of d.people) d = toggleEven(d, beer.id, p)
    d = setItemMode(d, beer.id, 'por')
    const it = d.items.find((i) => i.id === beer.id)!
    expect(Object.values(it.a.por).reduce((a, b) => a + b, 0)).toBe(3)
    d = porStep(d, beer.id, 'me', 1)
    expect(unassigned(d).some((i) => i.id === beer.id)).toBe(true)
    d = porStep(d, beer.id, d.people[1], -1)
    expect(unassigned(d).some((i) => i.id === beer.id)).toBe(false)
  })
  it('whole-bill equal split assigns everything and carries guests', () => {
    let d = fresh('g:g1')
    const w = { ...wholeFromDraft(d), mode: 'eq' as const, g: { james: 1 } }
    d = must(applyWhole(d, w))
    expect(unassigned(d)).toHaveLength(0)
    expect(d.guests).toEqual({ james: 1 })
    const c = calc(d)
    expect(c.rows.reduce((a, r) => a + r.total, 0)).toBe(c.total)
    expect(canContinue(d, 'assign')).toBe(true)
  })
  it('whole-bill custom amounts must match the receipt total', () => {
    const d = fresh('g:g1')
    const w = { mode: 'amt' as const, sel: ['me', 'james'], amt: { me: 10000, james: 5000 }, g: {} }
    expect(applyWhole(d, w).err).toBeTruthy()
    const good = must(applyWhole(d, { ...w, amt: { me: 10000, james: 5040 } }))
    expect(good.fixed).toEqual({ me: 10000, james: 5040 })
    expect(calc(good).total).toBe(15040)
    expect(applyWhole(d, { ...w, sel: [] }).err).toBeTruthy()
  })
  it('guest steps stay within 0 to 9', () => {
    let d = fresh()
    d = stepGuest(d, 'james', -1)
    expect(d.guests.james).toBe(0)
    for (let i = 0; i < 12; i++) d = stepGuest(d, 'james', 1)
    expect(d.guests.james).toBe(9)
  })
})

describe('payers, extras and saving', () => {
  it('several payers must add up to the total including extras', () => {
    let d = addExtra(fresh('g:g1'))
    d = { ...d, extras: [{ ...d.extras[0], amt: 1000 }] }
    expect(grandTotal(d)).toBe(16040)
    d = setPayer(d, '__multi')
    expect(d.paid).toEqual({ me: 16040 })
    d = paidRest(setPaid(d, 'me', 6000), 'james')
    expect(d.paid.james).toBe(10040)
    expect(canContinue(d, 'details')).toBe(true)
    expect(canContinue(setPaid(d, 'james', 1), 'details')).toBe(false)
    expect(setPayer(d, 'priya').multi).toBe(false)
  })
  it('extras need a name and amount before continuing', () => {
    const d = addExtra(fresh())
    expect(canContinue(d, 'review')).toBe(false)
  })
  it('toBill caches shares that sum to the total, and keeps the largest payer', () => {
    let d = must(applyWhole(fresh('g:g1'), { ...wholeFromDraft(fresh('g:g1')), mode: 'eq' }))
    d = setPaid(setPayer(d, '__multi'), 'me', 5000)
    d = paidRest(d, 'james')
    const b = toBill({ ...d, title: '  ' })
    expect(b.title).toBe('Untitled bill')
    expect(Object.values(b.shares).reduce((a, v) => a + v, 0)).toBe(b.total)
    expect(b.paid).toEqual({ me: 5000, james: 10040 })
    expect(b.payer).toBe('james')
  })
  it('round-trips a saved bill through edit', () => {
    const l = s.ledgers.find((x) => x.id === 'g1')!
    const bill = l.bills[0]
    const d = draftFromBill(bill, l)
    expect(d.editingId).toBe(bill.id)
    expect(toBill(d).total).toBe(bill.total)
    expect(toBill(d).shares).toEqual(bill.shares)
  })
})

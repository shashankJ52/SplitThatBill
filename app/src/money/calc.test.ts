import { describe, expect, it } from 'vitest'
import { calc, computeShares, discCents, itemWeights, paidMap } from './calc'
import { bill, ev, item, por, rng } from './fixtures'
import type { BillInput } from './types'

const people = ['me', 'james', 'eddie', 'sam']
const base = (o: Partial<BillInput> = {}): BillInput => ({
  people, items: [], tax: 0, tip: 0, disc: null, rt: 0, extras: [], guests: {}, payer: 'me', paid: null, fixed: null, ...o,
})
const total = (b: BillInput) => calc(b).rows.reduce((a, r) => a + r.total, 0)

describe('item weights', () => {
  it('counts guests (+1s) on evenly split items', () => {
    const w = itemWeights({ people, guests: { james: 2 } }, item(1, 'Nachos', 1400, ev(people)))
    expect(w).toEqual({ me: 1, james: 3, eddie: 1, sam: 1 })
  })
  it('is null when nobody is assigned', () => {
    expect(itemWeights({ people, guests: {} }, item(1, 'x', 100, ev([])))).toBeNull()
  })
  it('requires portions to add up to the quantity', () => {
    const it4 = item(1, 'Cola', 1200, por({ me: 0.5, james: 2.5 }), 4)
    expect(itemWeights({ people, guests: {} }, it4)).toBeNull()
    const ok = item(1, 'Cola', 1200, por({ me: 0.5, james: 2.5, sam: 1 }), 4)
    expect(itemWeights({ people, guests: {} }, ok)).toEqual({ me: 0.5, james: 2.5, sam: 1 })
  })
  it('ignores people who are not in the split', () => {
    expect(itemWeights({ people: ['me'], guests: {} }, item(1, 'x', 100, ev(['me', 'ghost'])))).toEqual({ me: 1 })
  })
})

describe('calc', () => {
  it('splits an item between its people', () => {
    const b = base({ items: [item(1, 'Salad', 1250, ev(['me']))], rt: 1250 })
    expect(computeShares(b)).toEqual({ me: 1250 })
  })
  it('flags incomplete bills', () => {
    const r = calc(base({ items: [item(1, 'Salad', 1250, ev([]))], rt: 1250 }))
    expect(r.complete).toBe(false)
  })
  it('shares tax and tip in proportion to items', () => {
    const b = base({
      people: ['me', 'james'],
      items: [item(1, 'A', 3000, ev(['me'])), item(2, 'B', 1000, ev(['james']))],
      tax: 400, tip: 400, rt: 4800,
    })
    const rows = calc(b).rows
    expect(rows.map((r) => r.total)).toEqual([3600, 1200])
  })
  it('splits the cola example with portions and a guest on the shared item', () => {
    const b = base({
      people: ['me', 'james', 'marie'],
      items: [item(1, 'Cola', 1200, por({ me: 0.5, james: 2.5, marie: 1 }), 4)], rt: 1200,
    })
    expect(computeShares(b)).toEqual({ me: 150, james: 750, marie: 300 })
  })
  it('applies a percent discount in proportion to items', () => {
    const b = base({ people: ['me', 'james'], items: [item(1, 'A', 6000, ev(['me'])), item(2, 'B', 3000, ev(['james']))], tip: 900, disc: { m: 'pct', v: 10 }, rt: 8910 })
    expect(discCents(b)).toBe(990)
    expect(total(b)).toBe(8910)
  })
  it('applies a dollar discount and caps it at the bill total', () => {
    const b = base({ people: ['me'], items: [item(1, 'A', 1000, ev(['me']))], disc: { m: 'amt', v: 50000 } })
    expect(discCents(b)).toBe(1000)
  })
  it('never goes negative on discount', () => {
    expect(discCents(base({ disc: { m: 'amt', v: -500 } }))).toBe(0)
  })
  it('shares extras evenly between people with items', () => {
    const b = base({
      people: ['me', 'james', 'eddie'],
      items: [item(1, 'A', 1000, ev(['me'])), item(2, 'B', 1000, ev(['james']))],
      extras: [{ id: 1, name: 'Cab', amt: 1000, split: 'even', people: [] }], rt: 2000,
    })
    const rows = calc(b).rows
    expect(rows.map((r) => r.ex)).toEqual([500, 500, 0])
    expect(calc(b).total).toBe(3000)
  })
  it('shares extras in proportion to items', () => {
    const b = base({
      people: ['me', 'james'],
      items: [item(1, 'A', 3000, ev(['me'])), item(2, 'B', 1000, ev(['james']))],
      extras: [{ id: 1, name: 'Parking', amt: 400, split: 'prop', people: [] }], rt: 4000,
    })
    expect(calc(b).rows.map((r) => r.ex)).toEqual([300, 100])
  })
  it('shares extras between chosen people, falling back to proportional when none chosen', () => {
    const items = [item(1, 'A', 3000, ev(['me'])), item(2, 'B', 1000, ev(['james']))]
    const chosen = base({ people: ['me', 'james', 'sam'], items, rt: 4000, extras: [{ id: 1, name: 'Cab', amt: 1800, split: 'pick', people: ['me', 'sam'] }] })
    expect(calc(chosen).rows.map((r) => r.ex)).toEqual([900, 0, 900])
    const none = base({ people: ['me', 'james'], items, rt: 4000, extras: [{ id: 1, name: 'Cab', amt: 400, split: 'pick', people: [] }] })
    expect(calc(none).rows.map((r) => r.ex)).toEqual([300, 100])
  })
  it('uses custom amounts for the whole bill and ignores item assignment', () => {
    const b = base({ people: ['me', 'james', 'eddie'], items: [item(1, 'A', 6500, ev([]))], rt: 6500, fixed: { me: 2000, james: 4000, eddie: 500 } })
    expect(calc(b).rows.map((r) => r.total)).toEqual([2000, 4000, 500])
    expect(calc(b).complete).toBe(true)
  })
  it('splits a whole bill equally with a +1 guest counting as two', () => {
    const b = base({
      people: ['me', 'james', 'priya'],
      items: [item(1, 'Dinner', 15040, ev(['me', 'james', 'priya']))], rt: 15040, guests: { james: 1 },
    })
    const rows = calc(b).rows
    expect(rows[1].total).toBe(7520)
    expect(rows[0].total + rows[2].total).toBe(7520)
    expect(total(b)).toBe(15040)
  })
  it('always adds up to items + tax + tip - discount + extras (random bills)', () => {
    const r = rng(7)
    for (let n = 0; n < 300; n++) {
      const ppl = ['a', 'b', 'c', 'd'].slice(0, 2 + Math.floor(r() * 3))
      const items = Array.from({ length: 1 + Math.floor(r() * 6) }, (_, i) =>
        item(i + 1, 'i' + i, 100 + Math.floor(r() * 5000), ev(ppl.filter(() => r() > 0.4).concat(ppl[0]).filter((p, k, a) => a.indexOf(p) === k))))
      const tax = Math.floor(r() * 800)
      const tip = Math.floor(r() * 1500)
      const disc = r() > 0.5 ? ({ m: 'pct', v: Math.round(r() * 30) } as const) : null
      const guests = r() > 0.6 ? { [ppl[1]]: 1 + Math.floor(r() * 2) } : {}
      const extras = r() > 0.5 ? [{ id: 1, name: 'Cab', amt: 500 + Math.floor(r() * 3000), split: (['even', 'prop', 'pick'] as const)[Math.floor(r() * 3)], people: ppl.slice(0, 2) }] : []
      const b = base({ people: ppl, items, tax, tip, disc, extras, guests, payer: ppl[0], rt: 0 })
      b.rt = items.reduce((a, i) => a + i.price, 0) + tax + tip - discCents(b)
      const c = calc(b)
      expect(c.complete).toBe(true)
      expect(c.rows.reduce((a, x) => a + x.total, 0)).toBe(c.total)
      expect(c.rows.every((x) => x.total >= 0)).toBe(true)
    }
  })
})

describe('paidMap', () => {
  it('assumes a single payer paid everything', () => {
    expect(paidMap({ payer: 'me', paid: null }, 5000)).toEqual({ me: 5000 })
    expect(paidMap({ payer: 'me', paid: {} }, 5000)).toEqual({ me: 5000 })
  })
  it('uses exact amounts when several people paid, ignoring zeros', () => {
    expect(paidMap({ payer: 'me', paid: { me: 6000, james: 4000, eddie: 0 } }, 10000)).toEqual({ me: 6000, james: 4000 })
  })
})

describe('bill helper', () => {
  it('caches shares and total', () => {
    const b = bill('x', { people: ['me'], items: [item(1, 'A', 500, ev(['me']))], payer: 'me', rt: 500 })
    expect(b.shares).toEqual({ me: 500 })
    expect(b.total).toBe(500)
  })
})

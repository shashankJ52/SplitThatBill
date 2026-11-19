import { describe, expect, it } from 'vitest'
import { calc, paidMap } from './calc'
import { nets, transfers } from './balances'
import { exactShares, passes, verifyBill, verifyLedger } from './audit'
import { bill, ev, item, por, rng } from './fixtures'
import type { BillInput, Item } from './types'

// "Uber Eats Costco - $200", rebuilt from the exported PDF: its 16 lines, the $16.29 tip, a $100.00 discount, paid by Sagar.
const SH = 'shashank'
const SA = 'sagar'
const AJ = 'ajith'
const costco = (): BillInput => ({
  people: [SH, SA, AJ],
  items: [
    item(1, 'Avocado Mash', 1445, ev([SA, AJ, SH])),
    item(2, 'Iodized Salt', 199, ev([SH, SA, AJ])),
    item(3, 'Italian Style T', 1223, ev([SH, SA, AJ])),
    item(4, 'Organic Tomato', 1167, ev([SH, SA, AJ])),
    item(5, 'Ginger Root', 833, ev([SH, SA, AJ])),
    item(6, 'Noga Dahi', 722, ev([SH, SA, AJ])),
    item(7, 'Chobani Yogurt', 2002, ev([SH, SA, AJ])),
    item(8, 'Planet Oat Oatmilk', 577, ev([SA])),
    item(9, 'Nescafe', 2391, ev([SA])),
    item(10, 'Goya Chick Peas', 944, ev([SH, SA, AJ])),
    item(11, 'Goya Black Beans', 944, ev([SH, SA, AJ])),
    item(12, 'ReaLemon', 722, ev([SH, SA, AJ])),
    item(13, 'Jessicas Tuscan White', 1000, ev([SH, SA, AJ])),
    item(14, 'Asaro Castelvetrano', 1067, ev([SH, SA, AJ])),
    item(15, 'Fresh Roti', 1189, ev([SH, SA, AJ])),
    item(16, 'Kirkland Unsalted', 1946, ev([SH, SA, AJ])),
  ],
  tax: 0, tip: 1629, disc: { m: 'amt', v: 10000 }, rt: 10000, extras: [], guests: {}, payer: SA, paid: null, fixed: null,
})

describe('the Uber Eats Costco bill from the exported PDF', () => {
  it('comes to exactly the shares the app and the PDF show, from the raw lines', () => {
    const c = calc(costco())
    const by = Object.fromEntries(c.rows.map((r) => [r.p, r]))
    expect(c.total).toBe(10000)
    expect([by[SH].total, by[SA].total, by[AJ].total]).toEqual([2797, 4412, 2791])
    expect([by[SH].sub, by[SA].sub, by[AJ].sub]).toEqual([5139, 8104, 5128]) // "Items" on the bill page
    expect([by[SH].fee, by[SA].fee, by[AJ].fee]).toEqual([456, 719, 454]) // "tax & tip"
    expect([by[SH].dc, by[SA].dc, by[AJ].dc]).toEqual([2798, 4411, 2791]) // "discount"
  })

  it('says Sagar paid 100.00, so he is owed 55.88 and the other two owe him 27.97 and 27.91 (the PDF is right)', () => {
    const b = costco()
    const pm = paidMap(b, calc(b).total)
    expect(pm).toEqual({ [SA]: 10000 })
    const ledger = { id: 'g', kind: 'group' as const, members: b.people, bills: [bill('b', { ...b, items: b.items, payer: SA, rt: b.rt })], payments: [], simplify: false }
    const n = nets(ledger)
    expect(n[SA]).toBe(5588)
    expect(n[SH]).toBe(-2797)
    expect(n[AJ]).toBe(-2791)
    // 44.12 is Sagar's own share of the bill, 55.88 is what the others owe him: 100.00 - 44.12
    expect(10000 - calc(b).rows.find((r) => r.p === SA)!.total).toBe(5588)
    expect(transfers(ledger).map((t) => [t.from, t.to, t.amt]).sort()).toEqual([[AJ, SA, 2791], [SH, SA, 2797]])
  })

  it('passes every check, including the independent exact calculation', () => {
    expect(verifyBill(costco())).toEqual([])
  })
})

describe('verifyBill finds what is wrong', () => {
  const codes = (b: Parameters<typeof verifyBill>[0]) => verifyBill(b).map((p) => p.code)

  it('a receipt total that does not match its items', () => {
    expect(codes({ ...costco(), rt: 10100 })).toContain('receipt-mismatch')
  })
  it('an item nobody has', () => {
    const b = costco()
    b.items[0] = item(1, 'Avocado Mash', 1445, ev([]))
    expect(codes(b)).toContain('unassigned')
  })
  it('payments that do not add up to the bill', () => {
    expect(codes({ ...costco(), paid: { [SA]: 9000 } })).toContain('paid-sum')
  })
  it('a saved total or shares that have gone out of date, as a warning only', () => {
    const b = { ...costco(), total: 9999, shares: { [SH]: 1, [SA]: 2, [AJ]: 3 } }
    const p = verifyBill(b)
    expect(p.map((x) => x.code)).toEqual(expect.arrayContaining(['stale-total', 'stale-shares']))
    expect(p.every((x) => x.level === 'warn')).toBe(true)
  })
  it('custom amounts that do not add up to the receipt', () => {
    const b: BillInput = { people: [SH, SA], items: [], tax: 0, tip: 0, disc: null, rt: 10000, extras: [], guests: {}, payer: SH, paid: null, fixed: { [SH]: 6000, [SA]: 3000 } }
    expect(codes(b)).toContain('receipt-mismatch')
  })
})

describe('the exact second calculation', () => {
  it('agrees with the rounded shares to within a few cents on the Costco bill', () => {
    const exact = exactShares(costco())!
    const c = calc(costco())
    for (const r of c.rows) expect(Math.abs(r.total - exact[r.p])).toBeLessThan(5)
    expect(Object.values(exact).reduce((a, v) => a + v, 0)).toBeCloseTo(10000, 3)
  })
})

describe('rounding that is magnified by a large tip on tiny items', () => {
  // found by the random bills: one 75 cent item split two ways, with $21.34 of tax and tip
  const tiny: BillInput = { people: ['p1', 'p2'], items: [item(1, 'Mint', 75, ev(['p1', 'p2']))], tax: 685, tip: 1449, disc: null, rt: 2209, extras: [], guests: {}, payer: 'p1', paid: null, fixed: null }
  it('moves a share by tens of cents compared with the exact figure, which the checker expects and accepts', () => {
    const c = calc(tiny)
    expect(c.rows.map((r) => r.total)).toEqual([1120, 1089]) // 38c vs 37c of item, so tax and tip split 1082 / 1052
    expect(Math.abs(c.rows[0].total - exactShares(tiny)!.p1)).toBeGreaterThan(10) // 11.20 against an exact 11.045
    expect(verifyBill(tiny)).toEqual([])
  })
  it('still adds up to the bill exactly, which is the part that matters', () => {
    const c = calc(tiny)
    expect(c.rows.reduce((a, r) => a + r.total, 0)).toBe(c.total)
  })
})

describe('random bills', () => {
  /** A bill with a random mix of everything: portions, guests, tax, tip, a discount, extras, extra discounts, several payers. */
  function randomBill(r: () => number): { b: BillInput; id: string } {
    const people = ['p1', 'p2', 'p3', 'p4', 'p5'].slice(0, 2 + Math.floor(r() * 4))
    const n = 1 + Math.floor(r() * 9)
    const items: Item[] = []
    for (let i = 0; i < n; i++) {
      const price = 50 + Math.floor(r() * 9000)
      const who = people.filter(() => r() < 0.6)
      const pick = who.length ? who : [people[0]]
      const qty = r() < 0.2 ? 2 : 1
      items.push(qty === 2 && r() < 0.5 ? item(i + 1, `i${i}`, price, por({ [pick[0]]: 0.5, [people[(people.indexOf(pick[0]) + 1) % people.length]]: 1.5 }), 2) : item(i + 1, `i${i}`, price, ev(pick), qty))
    }
    const guests = Object.fromEntries(people.filter(() => r() < 0.2).map((p) => [p, 1 + Math.floor(r() * 2)]))
    const tax = Math.floor(r() * 900)
    const tip = Math.floor(r() * 1500)
    const sum = items.reduce((a, i) => a + i.price, 0)
    const dv = r() < 0.4 ? Math.floor(r() * (sum + tax + tip) * 0.5) : 0
    const disc = dv ? ({ m: 'amt', v: dv } as const) : r() < 0.2 ? ({ m: 'pct', v: 10 } as const) : null
    const dcents = disc ? (disc.m === 'amt' ? disc.v : Math.round(((sum + tax + tip) * disc.v) / 100)) : 0
    const extras = r() < 0.4 ? [{ id: 1, name: 'Cab', amt: 300 + Math.floor(r() * 900), split: (['even', 'prop', 'pick'] as const)[Math.floor(r() * 3)], people: people.slice(0, 2) }] : []
    const rt = sum + tax + tip - dcents
    const credits = r() < 0.4 ? [{ id: 1, name: 'Cashback', m: (r() < 0.5 ? 'pct' : 'amt') as 'pct' | 'amt', v: r() < 0.5 ? 5 + Math.floor(r() * 30) : 100 + Math.floor(r() * 900) }] : []
    const b: BillInput = { people, items, tax, tip, disc, rt, extras, credits: credits.map((c) => (c.m === 'pct' ? { ...c, v: Math.min(c.v, 40) } : c)), guests, payer: people[0], paid: null, fixed: null }
    return { b, id: 'x' }
  }

  it('2,000 of them pass every check, and their balances always cancel out', () => {
    const r = rng(20261119)
    const bad: string[] = []
    for (let i = 0; i < 2000; i++) {
      const { b } = randomBill(r)
      const p = verifyBill(b).filter((x) => x.level === 'error')
      if (p.length) bad.push(`#${i}: ${p.map((x) => x.code + ' ' + x.message).join('; ')}`)
      const bl = bill(`b${i}`, { ...b, payer: b.people[0] })
      const check = verifyLedger({ bills: [bl], payments: [] })
      if (!passes(check)) bad.push(`#${i} ledger: ${JSON.stringify(check.problems)}`)
    }
    expect(bad.slice(0, 5)).toEqual([])
  })
})

describe('verifyLedger', () => {
  const ledger = () => {
    const b1 = bill('b1', { ...costco(), payer: SA })
    const b2 = bill('b2', { people: [SH, SA], items: [item(1, 'Pizza', 2400, ev([SH, SA]))], payer: SH, rt: 2400 })
    return { bills: [b1, b2], payments: [{ id: 'p1', from: SH, to: SA, amt: 1000 }] }
  }
  it('passes for a normal group and finds balances that cancel out', () => {
    const c = verifyLedger(ledger())
    expect(passes(c)).toBe(true)
    expect(c.netTotal).toBe(0)
    expect(c.bills).toHaveLength(2)
  })
  it('flags a payment of nothing and a payment to oneself', () => {
    const l = ledger()
    l.payments = [{ id: 'a', from: SH, to: SA, amt: 0 }, { id: 'b', from: SH, to: SH, amt: 500 }]
    const c = verifyLedger(l)
    expect(passes(c)).toBe(false)
    expect(c.payments.flatMap((p) => p.problems.map((x) => x.code)).sort()).toEqual(['payment-amount', 'payment-self'])
  })
  it('flags a bill whose receipt does not match, and says which bill', () => {
    const l = ledger()
    l.bills[1] = { ...l.bills[1], rt: 9999 } as typeof l.bills[number]
    const c = verifyLedger(l)
    expect(passes(c)).toBe(false)
    expect(c.bills[1].problems.map((p) => p.code)).toContain('receipt-mismatch')
    expect(c.bills[0].problems).toEqual([])
  })
})

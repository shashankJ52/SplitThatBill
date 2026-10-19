import { describe, expect, it } from 'vitest'
import { debts, nets, overall, pairNet, planPayment, simplified, transfers } from './balances'
import { bill, ev, item, ledger, por, rng } from './fixtures'

const A3 = ['me', 'james', 'priya']
const F4 = ['me', 'james', 'eddie', 'sam']
const sumVals = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0)

const even = (id: string, amt: number, people: string[], payer: string) =>
  bill(id, { people, items: [item(1, id, amt, ev(people))], payer, rt: amt })

describe('debts', () => {
  it('makes everyone else owe the single payer their share', () => {
    const L = ledger('g', 'group', A3, [even('b', 8400, A3, 'james')])
    expect(debts(L).sort((a, b) => a.from.localeCompare(b.from))).toEqual([
      { from: 'me', to: 'james', amt: 2800 },
      { from: 'priya', to: 'james', amt: 2800 },
    ])
  })
  it('settles a bill two people paid for (6000 and 4000 of 10000, split four ways)', () => {
    const b = bill('brunch', { people: F4, items: [item(1, 'Brunch', 10000, ev(F4))], payer: 'me', paid: { me: 6000, james: 4000 }, rt: 10000 })
    const t = debts(ledger('g', 'group', F4, [b]))
    const find = (f: string, to: string) => t.find((x) => x.from === f && x.to === to)?.amt
    expect(find('eddie', 'me')).toBe(2500)
    expect(find('sam', 'me')).toBe(1000)
    expect(find('sam', 'james')).toBe(1500)
    expect(t).toHaveLength(3)
  })
  it('nets opposite debts between a pair', () => {
    const L = ledger('g', 'group', A3, [even('a', 6000, A3, 'me'), even('b', 3000, A3, 'james')])
    // me paid 6000 (james owes 2000), james paid 3000 (me owes 1000) -> james owes me 1000
    const t = debts(L).find((x) => x.from === 'james' && x.to === 'me')
    expect(t?.amt).toBe(1000)
  })
  it('lets payments reduce a debt, and flip it when overpaid', () => {
    const L = ledger('g', 'group', ['me', 'james'], [even('a', 6000, ['me', 'james'], 'me')])
    L.payments.push({ id: 'p', from: 'james', to: 'me', amt: 1000 })
    expect(debts(L)).toEqual([{ from: 'james', to: 'me', amt: 2000 }])
    L.payments.push({ id: 'q', from: 'james', to: 'me', amt: 3500 })
    expect(debts(L)).toEqual([{ from: 'me', to: 'james', amt: 1500 }])
  })
  it('is empty when everything is settled', () => {
    const L = ledger('g', 'group', ['me', 'james'], [even('a', 6000, ['me', 'james'], 'me')])
    L.payments.push({ id: 'p', from: 'james', to: 'me', amt: 3000 })
    expect(debts(L)).toEqual([])
  })
})

describe('nets and simplified', () => {
  it('nets add up to zero', () => {
    const L = ledger('g', 'group', F4, [even('a', 15040, F4, 'me'), even('b', 9300, F4, 'sam')])
    expect(sumVals(nets(L))).toBe(0)
  })
  it('simplified payments keep every net and never use more payments than people - 1', () => {
    const r = rng(11)
    for (let n = 0; n < 200; n++) {
      const bills = Array.from({ length: 1 + Math.floor(r() * 5) }, (_, i) => even('b' + i, 500 + Math.floor(r() * 20000), F4, F4[Math.floor(r() * 4)]))
      const L = ledger('g', 'group', F4, bills)
      const net = nets(L)
      const sim = simplified(L)
      const after: Record<string, number> = {}
      for (const t of sim) {
        after[t.from] = (after[t.from] ?? 0) - t.amt
        after[t.to] = (after[t.to] ?? 0) + t.amt
      }
      for (const p of F4) expect(after[p] ?? 0).toBe(net[p] ?? 0)
      expect(sim.length).toBeLessThanOrEqual(F4.length - 1)
    }
  })
  it('uses simplified transfers only when the ledger asks for it', () => {
    const bills = [even('a', 9000, A3, 'me'), even('b', 6000, A3, 'james')]
    expect(transfers(ledger('g', 'group', A3, bills, { simplify: false })).length).toBeGreaterThanOrEqual(1)
    const simple = ledger('g', 'group', A3, bills, { simplify: true })
    expect(transfers(simple)).toEqual(simplified(simple))
  })
})

describe('person balances across ledgers', () => {
  const group = ledger('g2', 'group', F4, [even('dinner', 15040, F4, 'me')])
  const oneJames = ledger('o1', 'one', ['me', 'james'], [bill('tix', { people: ['me', 'james'], items: [item(1, 'Tickets', 8000, por({ me: 1, james: 1 }), 2)], payer: 'me', rt: 8000 })])
  const all = [group, oneJames]

  it('combines 1-1 and group balances with one person', () => {
    const pr = pairNet(all, 'me', 'james')
    expect(pr.tot).toBe(4000 + 3760)
    expect(pr.parts).toHaveLength(2)
  })
  it('totals net out per person', () => {
    const o = overall(all, 'me', ['me', 'james', 'eddie', 'sam'])
    expect(o.owe).toBe(0)
    expect(o.owed).toBe(4000 + 3760 + 3760 + 3760)
  })
  it('plans a payment 1-1 first and then into groups', () => {
    const plan = planPayment(all, 'me', 'james', 'in', 7760)
    expect(plan.from).toBe('james')
    expect(plan.to).toBe('me')
    expect(plan.steps.map((s) => [s.ledger?.id, s.amt])).toEqual([['o1', 4000], ['g2', 3760]])
  })
  it('puts only what is owed on each ledger and credits the rest to the 1-1 ledger', () => {
    const plan = planPayment(all, 'me', 'james', 'in', 9000)
    expect(plan.steps.reduce((a, s) => a + s.amt, 0)).toBe(9000)
    expect(plan.steps[plan.steps.length - 1].ledger?.id).toBe('o1')
  })
  it('clears both the person balance and the group balance when applied', () => {
    const plan = planPayment(all, 'me', 'james', 'in', 7760)
    for (const s of plan.steps) s.ledger?.payments.push({ id: 'x', from: plan.from, to: plan.to, amt: s.amt })
    expect(pairNet(all, 'me', 'james').tot).toBe(0)
    expect(nets(group).me).toBe(3760 * 2)
  })
  it('opens a 1-1 credit when nothing is owed and there is no 1-1 ledger', () => {
    const plan = planPayment([group], 'me', 'priya', 'out', 500)
    expect(plan.steps).toEqual([{ ledger: null, amt: 500 }])
  })
})

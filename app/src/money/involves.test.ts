import { describe, expect, it } from 'vitest'
import { makeBill } from '../domain/bills'
import { involves, pairNet, planPayment, type Ledger } from './index'

const ME = 'me'
const AMY = 'amy'
const bill = (payer: string, people: string[], total: number) =>
  makeBill({ id: crypto.randomUUID(), title: 't', date: '2026-10-20', payer, by: payer, rt: total, people, items: [{ id: 1, name: 'x', qty: 1, price: total, a: { mode: 'even', even: people, por: {} } }] })

/** A group and a 1-1 where Amy owes me, but she has not accepted the group invitation yet: members only lists me. */
const ledgers = (): Ledger[] =>
  [
    { id: 'g', kind: 'group', members: [ME], simplify: true, bills: [bill(ME, [ME, AMY], 10000)], payments: [] },
    { id: 'o', kind: 'one', members: [ME, AMY], simplify: false, bills: [bill(ME, [ME, AMY], 6000)], payments: [] },
  ] as Ledger[]

describe('who counts as part of a ledger', () => {
  it('members count, and so does anyone named in a bill or payment', () => {
    const [g, o] = ledgers()
    expect(involves(g, ME)).toBe(true)
    expect(involves(g, AMY)).toBe(true) // in a bill, though not yet a member
    expect(involves(g, 'stranger')).toBe(false)
    expect(involves({ ...o, bills: [], members: [ME] }, AMY)).toBe(false)
    expect(involves({ ...o, bills: [], members: [ME], payments: [{ id: 'p', from: AMY, to: ME, amt: 1 }] }, AMY)).toBe(true)
  })
  it('a person who paid only part of a bill still counts', () => {
    const b = { ...bill(ME, [ME], 1000), paid: { [ME]: 400, [AMY]: 600 } }
    expect(involves({ id: 'x', kind: 'group', members: [ME], bills: [b], payments: [] } as unknown as Ledger, AMY)).toBe(true)
  })
})

describe('balances with a friend who has not accepted yet', () => {
  it('counts what she owes in every ledger, not just the ones she has joined', () => {
    const r = pairNet(ledgers(), ME, AMY)
    expect(r.tot).toBe(8000) // 5000 in the group and 3000 in the 1-1
    expect(r.parts.map((p) => [p.ledger.id, p.amt]).sort()).toEqual([['g', 5000], ['o', 3000]])
  })
  it('a payment that covers both clears both, 1-1 first', () => {
    const plan = planPayment(ledgers(), ME, AMY, 'in', 8000)
    expect(plan.steps.map((x) => [x.ledger?.id, x.amt])).toEqual([['o', 3000], ['g', 5000]])
    expect(plan.from).toBe(AMY)
    expect(plan.to).toBe(ME)
  })
  it('applying that plan leaves nothing owed anywhere', () => {
    const ls = ledgers()
    const plan = planPayment(ls, ME, AMY, 'in', 8000)
    for (const s of plan.steps) (s.ledger as Ledger).payments.push({ id: crypto.randomUUID(), from: plan.from, to: plan.to, amt: s.amt })
    expect(pairNet(ls, ME, AMY).tot).toBe(0)
  })
  it('paying more than is owed credits the 1-1 ledger with the extra', () => {
    const plan = planPayment(ledgers(), ME, AMY, 'in', 9000)
    expect(plan.steps.map((x) => [x.ledger?.id, x.amt])).toEqual([['o', 3000], ['g', 5000], ['o', 1000]])
  })
})

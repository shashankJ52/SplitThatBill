import { beforeEach, describe, expect, it } from 'vitest'
import * as A from '../data/actions.ts'
import { createCloudRepository } from '../data/cloud/cloudRepository.ts'
import { makeBill } from '../domain/bills.ts'
import { ME } from '../domain/types.ts'
import type { AppState } from '../domain/types.ts'
import { uid } from '../domain/util.ts'
import { pairNet } from '../money/index.ts'
import { createTestDb, type TestDb } from './harness.ts'
import { pgliteDb } from './pgliteDb.ts'

let t: TestDb
let ann: string
let ben: string

beforeEach(async () => {
  t = await createTestDb()
  ann = await t.signUp('Ann Lee', 'ann')
  ben = await t.signUp('Ben Ray', 'ben')
}, 60_000)

const load = async (uidv: string) => {
  const repo = createCloudRepository(pgliteDb(t, uidv))
  return { repo, state: await repo.load() }
}
const bill = (title: string, payer: string, people: string[], total: number) =>
  makeBill({ id: uid(), title, date: '2026-10-20', payer, by: payer, rt: total, people, items: [{ id: 1, name: 'x', qty: 1, price: total, a: { mode: 'even', even: people, por: {} } }] })

describe('a payment with one person that spans a 1-1 split and a group', () => {
  it('clears both the 1-1 and the group, for both people, after a reload', async () => {
    const a = await load(ann)
    const gid = uid()
    const oid = uid()
    let s: AppState = A.createGroup(a.state, { id: gid, name: 'Flat', color: '#0039A6', simplify: true, members: [ME] })
    s = { ...s, people: { ...s.people, [ben]: { id: ben, name: 'Ben Ray', user: true, tag: 'ben' } } }
    s = A.ensureOneLedger(s, ben, oid).state
    await a.repo.save(s)
    // both invitations accepted
    for (const g of [gid, oid]) {
      await t.as(ann, () => t.sql('select invite_user($1, $2)', [g, ben]))
      await t.as(ben, () => t.sql('select accept_invite($1)', [g]))
    }
    s = (await load(ann)).state
    // Ben owes Ann 5000 in the group and 3000 in the 1-1 split
    s = A.addBill(s, gid, bill('Group dinner', ME, [ME, ben], 10000))
    s = A.addBill(s, oid, bill('Coffee', ME, [ME, ben], 6000))
    await a.repo.save(s)
    s = (await load(ann)).state
    expect(pairNet(s.ledgers as never, ME, ben).tot).toBe(8000)

    // Ann records that Ben paid her 8000 in cash, from Ben's page
    const r = A.applyPersonPayment(s, { id: uid(), newLedgerId: uid(), pid: ben, direction: 'in', amt: 8000, date: '2026-10-21' })
    expect(r.steps.map((x) => x.amt).sort()).toEqual([3000, 5000])
    await a.repo.save(r.state)

    for (const who of [ann, ben]) {
      const v = (await load(who)).state
      const other = who === ann ? ben : ann
      expect(v.ledgers).toHaveLength(2)
      const net = pairNet(v.ledgers as never, ME, other).tot
      expect(net).toBe(0)
      for (const l of v.ledgers) expect(l.payments.length).toBe(1)
    }
  })
})

describe('variants of the same payment', () => {
  const setup = async (opts: { acceptOneToOne: boolean; contact?: boolean }) => {
    const a = await load(ann)
    const gid = uid()
    const oid = uid()
    const sam = uid()
    let s: AppState = A.createGroup(a.state, { id: gid, name: 'Flat', color: '#0039A6', simplify: true, members: opts.contact ? [ME, sam] : [ME] })
    s = { ...s, people: { ...s.people, [ben]: { id: ben, name: 'Ben Ray', user: true, tag: 'ben' }, ...(opts.contact ? { [sam]: { id: sam, name: 'Sam', user: false } } : {}) } }
    s = A.ensureOneLedger(s, ben, oid).state
    await a.repo.save(s)
    await t.as(ann, () => t.sql('select invite_user($1, $2)', [gid, ben]))
    await t.as(ben, () => t.sql('select accept_invite($1)', [gid]))
    await t.as(ann, () => t.sql('select invite_user($1, $2)', [oid, ben]))
    if (opts.acceptOneToOne) await t.as(ben, () => t.sql('select accept_invite($1)', [oid]))
    s = (await load(ann)).state
    const ids = opts.contact ? [ME, ben, sam] : [ME, ben]
    s = A.addBill(s, gid, bill('Group dinner', ME, ids, opts.contact ? 9000 : 10000))
    s = A.addBill(s, oid, bill('Coffee', ME, [ME, ben], 6000))
    await a.repo.save(s)
    return { a, gid, oid }
  }
  const report = async () => {
    const out: Record<string, unknown> = {}
    for (const [name, who] of [['ann', ann], ['ben', ben]] as const) {
      const v = (await load(who)).state
      const other = who === ann ? ben : ann
      out[name] = {
        pair: pairNet(v.ledgers as never, ME, other).tot,
        ledgers: v.ledgers.map((l) => `${l.kind}:${l.members.length}m:${l.payments.length}p`),
      }
    }
    return out
  }

  it('Ben never accepted the 1-1 invite', async () => {
    const { a } = await setup({ acceptOneToOne: false })
    const s = (await load(ann)).state
    const before = pairNet(s.ledgers as never, ME, ben).tot
    const r = A.applyPersonPayment(s, { id: uid(), newLedgerId: uid(), pid: ben, direction: 'in', amt: before, date: '2026-10-21' })
    await a.repo.save(r.state)
    // his 1-1 debt is counted even though he has not accepted that invitation, and the payment clears both
    expect(before).toBe(8000)
    expect(r.steps.map((x) => x.amt)).toEqual([3000, 5000])
    const after = (await report()) as Record<string, { pair: number; ledgers: string[] }>
    expect(after.ann.pair).toBe(0)
    expect(after.ann.ledgers.sort()).toEqual(['group:2m:1p', 'one:1m:1p'])
    expect(after.ben.pair).toBe(0)
  })

  it('three people in the group, everything accepted', async () => {
    const { a } = await setup({ acceptOneToOne: true, contact: true })
    const s = (await load(ann)).state
    const before = pairNet(s.ledgers as never, ME, ben).tot
    const r = A.applyPersonPayment(s, { id: uid(), newLedgerId: uid(), pid: ben, direction: 'in', amt: before, date: '2026-10-21' })
    await a.repo.save(r.state)
    expect(before).toBe(6000) // the 9000 group dinner is split three ways, so Ben owes 3000 there and 3000 in the 1-1
    expect(r.steps.map((x) => x.amt)).toEqual([3000, 3000])
    const after = (await report()) as Record<string, { pair: number }>
    expect(after.ann.pair).toBe(0)
    expect(after.ben.pair).toBe(0)
  })
})

describe('paying more than is owed', () => {
  it('shows as one payment of the full amount, and the balance flips by the difference', async () => {
    const { personActivity, pairBalance } = await import('../domain/selectors.ts')
    // Ann and Ben share a 1-1 split; Ben owes Ann 156.04
    const a = await load(ann)
    const oid = uid()
    let s: AppState = { ...a.state, people: { ...a.state.people, [ben]: { id: ben, name: 'Ben Ray', user: true, tag: 'ben' } } }
    s = A.ensureOneLedger(s, ben, oid).state
    await a.repo.save(s)
    await t.as(ann, () => t.sql('select invite_user($1, $2)', [oid, ben]))
    await t.as(ben, () => t.sql('select accept_invite($1)', [oid]))
    s = (await load(ann)).state
    s = A.addBill(s, oid, bill('Coffee', ME, [ME, ben], 31208)) // 156.04 each
    await a.repo.save(s)

    // Ben pays 256.04 from his side
    const b = await load(ben)
    expect(pairBalance(b.state, ann).tot).toBe(-15604)
    const r = A.applyPersonPayment(b.state, { id: uid(), newLedgerId: uid(), pid: ann, direction: 'out', amt: 25604, date: '2026-10-21', note: 'Zelle ref 4821', img: 'data:image/png;base64,AAAA' })
    await b.repo.save(r.state)

    for (const [who, other] of [[ann, ben], [ben, ann]] as const) {
      const v = (await load(who)).state
      const pays = personActivity(v, other).filter((x) => x.k === 'p')
      expect(pays).toHaveLength(1)
      expect(pays[0].o).toMatchObject({ amt: 25604, note: 'Zelle ref 4821', img: 'data:image/png;base64,AAAA' })
      // the balance is the difference: Ann now owes Ben 100.00
      expect(pairBalance(v, other).tot).toBe(who === ann ? -10000 : 10000)
    }
  })
})

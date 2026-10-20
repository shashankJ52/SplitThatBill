import { beforeEach, describe, expect, it } from 'vitest'
import * as A from '../data/actions.ts'
import { createCloudRepository } from '../data/cloud/cloudRepository.ts'
import { makeBill } from '../domain/bills.ts'
import { toPublicView, type PublicBillData } from '../domain/publicBill.ts'
import { personName } from '../domain/selectors.ts'
import { ME } from '../domain/types.ts'
import { uid } from '../domain/util.ts'
import { calc, paidMap } from '../money/index.ts'
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

describe('opening a share link', () => {
  it('shows the bill, the split and first names to someone who is not signed in, and nothing else', async () => {
    const repo = createCloudRepository(pgliteDb(t, ann))
    const s0 = await repo.load()
    const gid = uid()
    const bill = makeBill({
      id: uid(), title: 'Dinner', date: '2026-10-20', loc: '12 Main St', payer: ME, by: ME, rt: 3000, people: [ME, ben], notes: 'Cab was split',
      items: [{ id: 1, name: 'Pasta', qty: 1, price: 3000, a: { mode: 'even', even: [ME, ben], por: {} } }],
      comments: [{ id: uid(), by: ME, text: 'private remark', ts: 1 }],
    })
    await repo.save(A.addBill(A.createGroup(s0, { id: gid, name: 'Secret club', color: '#0039A6', simplify: true, members: [ME] }), gid, bill))
    await t.as(ann, () => t.sql('select invite_user($1, $2)', [gid, ben]))
    await t.as(ben, () => t.sql('select accept_invite($1)', [gid]))

    // anyone with the link: no account, only the public key
    const raw = await t.anon(async () => (await t.sql('select public_bill($1) as d', [bill.token]))[0].d as PublicBillData)
    const view = toPublicView(raw)!
    expect(view.bill.title).toBe('Dinner')
    expect(view.bill.notes).toBe('Cab was split')
    expect(calc(view.bill).total).toBe(3000)
    expect(view.bill.shares).toEqual({ [ann]: 1500, [ben]: 1500 })
    expect(paidMap(view.bill, 3000)).toEqual({ [ann]: 3000 })
    expect(personName(view.state, ann, true)).toBe('Ann')
    expect(personName(view.state, ben, true)).toBe('Ben')
    expect(view.bill.comments).toEqual([])
    const everything = JSON.stringify(raw)
    expect(everything).not.toMatch(/Secret club|private remark|example\.com|Lee|Ray|"tag"/)
    // a wrong or missing link gives nothing
    expect(await t.anon(async () => (await t.sql(`select public_bill('not-a-real-token-123') as d`))[0].d)).toBeNull()
    expect(toPublicView(null)).toBeNull()
  })
})

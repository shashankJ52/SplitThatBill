import { beforeEach, describe, expect, it } from 'vitest'
import * as A from '../data/actions.ts'
import { createCloudRepository } from '../data/cloud/cloudRepository.ts'
import { toPublicView, type PublicBillData } from '../domain/publicBill.ts'
import { makeBill } from '../domain/bills.ts'
import { ledgerCurrency } from '../domain/selectors.ts'
import { ME } from '../domain/types.ts'
import type { AppState } from '../domain/types.ts'
import { uid } from '../domain/util.ts'
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

const load = async (who: string) => {
  const repo = createCloudRepository(pgliteDb(t, who))
  return { repo, state: await repo.load() }
}
const bill = (total: number, payer: string, people: string[]) =>
  makeBill({ id: uid(), title: 'Dinner', date: '2026-10-20', payer, by: payer, rt: total, people, items: [{ id: 1, name: 'x', qty: 1, price: total, a: { mode: 'even', even: people, per: {}, por: {} } as never }] })

/** Ann makes a euro group with Ben in it, and adds a bill. */
async function tripGroup() {
  const a = await load(ann)
  const gid = uid()
  let s: AppState = A.setDefaultCurrency(a.state, 'USD')
  s = A.createGroup(s, { id: gid, name: 'Euro trip', color: '#0039A6', simplify: true, members: [ME], currency: 'EUR' })
  s = { ...s, people: { ...s.people, [ben]: { id: ben, name: 'Ben Ray', user: true, tag: 'ben' } } }
  s = A.updateGroup(s, gid, { members: [ME, ben] })
  const b = bill(9000, ME, [ME, ben])
  s = A.addBill(s, gid, b)
  await a.repo.save(s)
  await t.as(ann, () => t.sql('select invite_user($1, $2)', [gid, ben]))
  await t.as(ben, () => t.sql('select accept_invite($1)', [gid]))
  return { gid, b, a }
}

describe('a group in its own currency', () => {
  it('is stored with the group and seen by every member, whatever their own default', async () => {
    const { gid } = await tripGroup()
    expect(ledgerCurrency((await load(ann)).state, gid)).toBe('EUR')
    const benState = (await load(ben)).state
    expect(ledgerCurrency(benState, gid)).toBe('EUR')
    expect(benState.layout?.currency).toBeUndefined() // Ben's own default is untouched
  })

  it('an admin can change it and a plain member cannot', async () => {
    const { gid } = await tripGroup()
    // Ben is a member: his update is refused and the group stays in euros
    const b = await load(ben)
    await b.repo.save(A.setLedgerCurrency(b.state, gid, 'GBP'))
    expect(ledgerCurrency((await load(ann)).state, gid)).toBe('EUR')
    // Ann is the owner
    const a = await load(ann)
    await a.repo.save(A.setLedgerCurrency(a.state, gid, 'GBP'))
    expect(ledgerCurrency((await load(ben)).state, gid)).toBe('GBP')
  })

  it('refuses a made-up currency code', async () => {
    const { gid } = await tripGroup()
    await expect(t.as(ann, () => t.sql(`update public.groups set currency = 'euros' where id = $1`, [gid]))).rejects.toThrow()
  })

  it('your own default currency is kept with your account, not shared', async () => {
    const a = await load(ann)
    await a.repo.save(A.setDefaultCurrency(a.state, 'INR'))
    expect((await load(ann)).state.layout?.currency).toBe('INR')
    expect((await load(ben)).state.layout?.currency).toBeUndefined()
  })

  it('alerts write amounts in the currency of the group', async () => {
    const { gid } = await tripGroup()
    // Ann adds a bill once Ben has joined; Ben's share is 45.00 euros
    const first = await load(ann)
    await first.repo.save(A.addBill(first.state, gid, bill(9000, ME, [ME, ben])))
    const notifs = (await t.as(ben, () => t.sql(`select data from public.notifs order by created_at`))).map((r) => r.data as { sub?: string })
    expect(notifs.map((n) => n.sub)).toContain('Your share €\u00a045.00')
    // and a payment alert
    const a = await load(ann)
    await a.repo.save(A.addPayment(a.state, gid, { id: uid(), linkId: uid(), from: ben, to: ME, amt: 4500, date: '2026-10-21', ts: Date.now() }))
    const all = (await t.as(ben, () => t.sql(`select data from public.notifs`))).map((r) => (r.data as { text: string }).text)
    expect(all.some((x) => x.includes('recorded a payment of €\u00a045.00'))).toBe(true)
  })

  it('a group that never chose a currency is written in each person\'s own default', async () => {
    const a = await load(ann)
    const gid = uid()
    let s: AppState = A.createGroup(a.state, { id: gid, name: 'Old flat', color: '#0039A6', simplify: true, members: [ME] })
    s = { ...s, ledgers: s.ledgers.map((l) => (l.id === gid ? { ...l, currency: undefined } : l)) }
    await a.repo.save(s)
    await t.sql(`update public.groups set currency = '' where id = $1`, [gid])
    await t.sql(`insert into public.prefs (user_id, layout) values ($1, '{"currency":"GBP"}')`, [ann])
    const text = await t.sql(`select public.money_in(1250, $1, $2) as m`, [gid, ann])
    expect(text[0].m).toBe('£\u00a012.50')
    expect((await t.sql(`select public.money_in(1250, $1, $2) as m`, [gid, ben]))[0].m).toBe('$\u00a012.50')
  })

  it('the public bill link shows the group currency', async () => {
    const { b } = await tripGroup()
    const token = (await t.sql('select token from public.bills where id = $1', [b.id]))[0].token as string
    const raw = await t.anon(async () => (await t.sql('select public_bill($1) as d', [token]))[0].d as PublicBillData)
    expect(raw.currency).toBe('EUR')
    const view = toPublicView(raw)!
    expect(view.state.layout?.currency).toBe('EUR')
  })
})

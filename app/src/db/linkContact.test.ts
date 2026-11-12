import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, type TestDb } from './harness.ts'

let t: TestDb
let ann: string
let ben: string
let cat: string
let g: string
let sam: string // a placeholder name for a roommate who has no account yet

const one = async (text: string, params: unknown[] = []) => (await t.sql(text, params))[0]

beforeEach(async () => {
  t = await createTestDb()
  ann = await t.signUp('Ann Lee', 'ann')
  ben = await t.signUp('Ben Ray', 'ben')
  cat = await t.signUp('Cat Doe', 'cat')
  g = randomUUID()
  sam = randomUUID()
  await t.as(ann, async () => {
    await t.sql(`insert into groups (id, kind, name, color, owner_id) values ($1, 'group', 'Flat', '#0039A6', $2)`, [g, ann])
    await t.sql(`insert into members (group_id, person_id, user_id, display_name, role, status) values ($1, $2, $2, 'Ann Lee', 'owner', 'active')`, [g, ann])
    await t.sql(`insert into members (group_id, person_id, user_id, display_name, role, status) values ($1, $2, null, 'Sam', 'member', 'active')`, [g, sam])
    const data = { title: 'Dinner', total: 3000, people: [ann, sam], payer: sam, shares: { [ann]: 1500, [sam]: 1500 }, paid: { [sam]: 3000 }, guests: { [sam]: 1 }, items: [{ id: 1, name: 'Pasta', price: 3000, a: { mode: 'even', even: [ann, sam], por: { [sam]: 1 } } }] }
    await t.sql(`insert into bills (id, group_id, bill_date, token, data) values ($1, $2, '2026-10-20', 'tokentokentoken1', $3)`, [randomUUID(), g, JSON.stringify(data)])
    await t.sql(`insert into payments (id, group_id, pay_date, data) values ($1, $2, '2026-10-21', $3)`, [randomUUID(), g, JSON.stringify({ from: sam, to: ann, amt: 500, date: '2026-10-21' })])
  })
}, 60_000)

const link = (who: string, uid: string, contact = sam) => t.as(who, () => t.sql('select link_contact($1, $2, $3)', [g, contact, uid]))

describe('linking a placeholder name to a real account', () => {
  it('turns the name into an invited member of that account, with the same group and nothing else changed', async () => {
    await link(ann, ben)
    const rows = await t.sql('select person_id, user_id, display_name, status, role from members where group_id = $1 and person_id <> $2', [g, ann])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ person_id: ben, user_id: ben, display_name: 'Ben Ray', status: 'invited', role: 'member' })
    expect((await one('select count(*)::int as n from groups where id = $1', [g])).n).toBe(1)
  })

  it('rewrites every mention in the bills and payments, so nothing is re-entered', async () => {
    await link(ann, ben)
    const b = (await one('select data::text as d from bills where group_id = $1', [g])).d as string
    const p = (await one('select data::text as d from payments where group_id = $1', [g])).d as string
    expect(b).not.toContain(sam)
    expect(p).not.toContain(sam)
    const bill = JSON.parse(b)
    expect(bill.people).toEqual([ann, ben])
    expect(bill.payer).toBe(ben)
    expect(bill.shares[ben]).toBe(1500)
    expect(bill.paid[ben]).toBe(3000)
    expect(bill.guests[ben]).toBe(1)
    expect(bill.items[0].a.even).toEqual([ann, ben])
    expect(bill.items[0].a.por[ben]).toBe(1)
    expect(bill.title).toBe('Dinner')
    expect(JSON.parse(p)).toMatchObject({ from: ben, to: ann, amt: 500 })
  })

  it('invites them, so they still have to accept before they can see the group', async () => {
    await link(ann, ben)
    const n = await one(`select data from notifs where user_id = $1`, [ben])
    expect((n.data as { kind: string; gid: string }).kind).toBe('invite')
    expect((await t.as(ben, () => t.sql('select count(*)::int as n from bills where group_id = $1', [g])))[0].n).toBe(0)
    await t.as(ben, () => t.sql('select accept_invite($1)', [g]))
    expect((await t.as(ben, () => t.sql('select count(*)::int as n from bills where group_id = $1', [g])))[0].n).toBe(1)
  })

  it('only an admin can do it', async () => {
    await expect(link(cat, ben)).rejects.toThrow(/Only an admin/)
    await expect(link(ben, ben)).rejects.toThrow(/Only an admin/)
  })

  it('refuses a real member as the placeholder, an unknown account and a made-up contact', async () => {
    await expect(link(ann, ben, ann)).rejects.toThrow(/without an account/)
    await expect(link(ann, randomUUID())).rejects.toThrow(/No such user/)
    await expect(link(ann, ben, randomUUID())).rejects.toThrow(/without an account/)
  })

  it('works for someone who left the group earlier, and cannot be done twice to the same name', async () => {
    await t.as(ann, () => t.sql('select invite_user($1, $2)', [g, ben]))
    await t.as(ben, () => t.sql('select accept_invite($1)', [g]))
    await t.as(ben, () => t.sql('select leave_group($1)', [g]))
    await link(ann, ben)
    expect((await one('select status from members where group_id = $1 and person_id = $2', [g, ben])).status).toBe('invited')
    await expect(link(ann, cat)).rejects.toThrow(/without an account/) // the name is no longer a placeholder
  })

  it('leaves other groups alone', async () => {
    const g2 = randomUUID()
    await t.as(ann, async () => {
      await t.sql(`insert into groups (id, kind, name, color, owner_id) values ($1, 'group', 'Trip', '#0039A6', $2)`, [g2, ann])
      await t.sql(`insert into members (group_id, person_id, user_id, display_name, role, status) values ($1, $2, $2, 'Ann Lee', 'owner', 'active')`, [g2, ann])
      await t.sql(`insert into members (group_id, person_id, user_id, display_name, role, status) values ($1, $2, null, 'Sam', 'member', 'active')`, [g2, sam])
    })
    await link(ann, ben)
    expect((await one('select user_id from members where group_id = $1 and person_id = $2', [g2, sam])).user_id).toBeNull()
  })
})

describe('matching a placeholder to someone who is already in the group', () => {
  const dana = randomUUID()
  const bill = (title: string, people: string[], total: number, payer: string) =>
    t.as(ann, () => t.sql(`insert into bills (id, group_id, bill_date, token, data) values ($1, $2, '2026-10-22', $3, $4)`, [randomUUID(), g, `tok${randomUUID().replace(/-/g, '')}`, JSON.stringify({ title, total, people, payer, shares: Object.fromEntries(people.map((p) => [p, total / people.length])), items: [{ id: 1, name: title, price: total, a: { mode: 'even', even: people, por: {} } }] })]))
  const joinBen = async (how: 'invite' | 'accepted') => {
    await t.as(ann, () => t.sql('select invite_user($1, $2)', [g, ben]))
    if (how === 'accepted') await t.as(ben, () => t.sql('select accept_invite($1)', [g]))
  }

  beforeEach(async () => {
    await t.as(ann, () => t.sql(`insert into members (group_id, person_id, user_id, display_name, role, status) values ($1, $2, null, 'Dana', 'member', 'active')`, [g, dana]))
  })

  it('moves the placeholder’s bills and payments to the member and removes the placeholder, leaving the other placeholder alone', async () => {
    await joinBen('accepted')
    await link(ann, ben)
    const rows = await t.sql('select person_id, status from members where group_id = $1 order by display_name', [g])
    expect(rows.map((r) => r.person_id)).toEqual(expect.arrayContaining([ann, ben, dana]))
    expect(rows.some((r) => r.person_id === sam)).toBe(false)
    expect((await one('select status from members where group_id = $1 and person_id = $2', [g, ben])).status).toBe('active') // unchanged
    const b = (await one('select data::text as d from bills where group_id = $1', [g])).d as string
    expect(b).not.toContain(sam)
    expect(JSON.parse(b).payer).toBe(ben)
  })

  it('works for someone who was only invited, without sending a second invite', async () => {
    await joinBen('invite')
    const before = (await one('select count(*)::int as n from notifs where user_id = $1', [ben])).n
    await link(ann, ben)
    expect((await one('select status from members where group_id = $1 and person_id = $2', [g, ben])).status).toBe('invited')
    expect((await one('select count(*)::int as n from notifs where user_id = $1', [ben])).n).toBe(before)
    expect((await one('select data::text as d from payments where group_id = $1', [g])).d).toContain(ben)
  })

  it('is refused when the two are in the same bill, and nothing changes', async () => {
    await joinBen('accepted')
    await bill('Shared dinner', [ann, sam, ben], 9000, ann)
    await expect(link(ann, ben)).rejects.toThrow(/same bill or payment/)
    expect((await one('select count(*)::int as n from members where group_id = $1 and person_id = $2', [g, sam])).n).toBe(1)
    expect((await one(`select count(*)::int as n from bills where group_id = $1 and data::text like $2`, [g, `%${sam}%`])).n).toBeGreaterThan(0)
  })

  it('is refused when one pays the other, because that would be a payment to themselves', async () => {
    await joinBen('accepted')
    await t.as(ann, () => t.sql(`insert into payments (id, group_id, pay_date, data) values ($1, $2, '2026-10-23', $3)`, [randomUUID(), g, JSON.stringify({ from: sam, to: ben, amt: 300, date: '2026-10-23' })]))
    await expect(link(ann, ben)).rejects.toThrow(/same bill or payment/)
  })

  it('still needs an admin', async () => {
    await joinBen('accepted')
    await expect(link(ben, ben)).rejects.toThrow(/Only an admin/)
  })

  it('two placeholders can be matched to two different people one after the other', async () => {
    await joinBen('accepted')
    await t.as(ann, () => t.sql('select invite_user($1, $2)', [g, cat]))
    await link(ann, ben)
    await link(ann, cat, dana)
    const ids = (await t.sql('select person_id from members where group_id = $1', [g])).map((r) => r.person_id)
    expect(ids.sort()).toEqual([ann, ben, cat].sort())
  })
})

import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { createCloudRepository } from '../data/cloud/cloudRepository.ts'
import { createTestDb, type TestDb } from './harness.ts'
import { pgliteDb } from './pgliteDb.ts'

let t: TestDb
let ann: string
let ben: string
let cat: string

const makeGroup = async (owner: string, name: string, ownerName: string) => {
  const g = randomUUID()
  await t.as(owner, async () => {
    await t.sql(`insert into groups (id, kind, name, color, owner_id) values ($1, 'group', $2, '#0039A6', $3)`, [g, name, owner])
    await t.sql(`insert into members (group_id, person_id, user_id, display_name, role, status) values ($1, $2, $2, $3, 'owner', 'active')`, [g, owner, ownerName])
  })
  return g
}
const join = async (g: string, owner: string, who: string) => {
  await t.as(owner, () => t.sql('select invite_user($1, $2)', [g, who]))
  await t.as(who, () => t.sql('select accept_invite($1)', [g]))
}
const bill = (uid: string, g: string, title: string) => {
  const id = randomUUID()
  return t.as(uid, () => t.sql(`insert into bills (id, group_id, bill_date, token, data) values ($1, $2, '2026-10-20', $3, $4)`, [id, g, `tok${id.replace(/-/g, '')}`, JSON.stringify({ title, total: 1000, shares: {}, items: [], comments: [], by: 'me', token: 'x' })])).then(() => id)
}
const del = (uid: string) => t.as(uid, () => t.sql('select delete_my_account()'))
const one = async (text: string, params: unknown[] = []) => (await t.sql(text, params))[0]

beforeEach(async () => {
  t = await createTestDb()
  ann = await t.signUp('Ann Lee', 'ann')
  ben = await t.signUp('Ben Ray', 'ben')
  cat = await t.signUp('Cat Doe', 'cat')
}, 60_000)

describe('deleting an account', () => {
  it('is refused while you own a group that another person with an account is in', async () => {
    const g = await makeGroup(ann, 'Flat', 'Ann Lee')
    await join(g, ann, ben)
    await expect(del(ann)).rejects.toThrow(/Hand over/)
    expect((await one(`select count(*)::int as n from auth.users where id = $1`, [ann])).n).toBe(1)
  })

  it('works once ownership is handed over, and the group carries on for everyone else', async () => {
    const g = await makeGroup(ann, 'Flat', 'Ann Lee')
    await join(g, ann, ben)
    await t.as(ann, () => t.sql('select transfer_ownership($1, $2)', [g, ben]))
    await del(ann)
    expect((await one(`select count(*)::int as n from auth.users where id = $1`, [ann])).n).toBe(0)
    expect((await one(`select count(*)::int as n from profiles where id = $1`, [ann])).n).toBe(0)
    const grp = await one(`select owner_id from groups where id = $1`, [g])
    expect(grp.owner_id).toBe(ben)
  })

  it('keeps what you made: your bills, payments and comments stay for the others', async () => {
    const g = await makeGroup(ann, 'Flat', 'Ann Lee')
    await join(g, ann, ben)
    const b1 = await bill(ann, g, 'Ann paid dinner')
    await t.as(ann, () => t.sql(`insert into payments (id, group_id, pay_date, data) values ($1, $2, '2026-10-20', $3)`, [randomUUID(), g, JSON.stringify({ from: ben, to: ann, amt: 500 })]))
    await t.as(ann, () => t.sql(`insert into comments (id, group_id, bill_id, text) values ($1, $2, $3, 'hello')`, [randomUUID(), g, b1]))
    await t.as(ann, () => t.sql('select transfer_ownership($1, $2)', [g, ben]))
    await del(ann)
    await t.as(ben, async () => {
      expect((await t.sql(`select count(*)::int as n from bills where id = $1`, [b1]))[0].n).toBe(1)
      expect((await t.sql(`select count(*)::int as n from payments where group_id = $1`, [g]))[0].n).toBe(1)
      expect((await t.sql(`select count(*)::int as n from comments where bill_id = $1`, [b1]))[0].n).toBe(1)
    })
  })

  it('leaves your name on the group as a former member', async () => {
    const g = await makeGroup(ann, 'Flat', 'Ann Lee')
    await join(g, ann, ben)
    await t.as(ann, () => t.sql('select transfer_ownership($1, $2)', [g, ben]))
    await del(ann)
    const m = await one(`select status, user_id, display_name, role from members where group_id = $1 and person_id = $2`, [g, ann])
    expect(m).toMatchObject({ status: 'left', user_id: null, display_name: 'Ann Lee' })
    // Ben can still read the old row, so the name still shows on old bills
    await t.as(ben, async () => expect((await t.sql(`select display_name from members where person_id = $1`, [ann]))[0].display_name).toBe('Ann Lee'))
  })

  it('a member who is not the owner simply leaves, and the group is untouched', async () => {
    const g = await makeGroup(ann, 'Flat', 'Ann Lee')
    await join(g, ann, ben)
    await bill(ben, g, 'Ben paid')
    await del(ben)
    expect((await one(`select count(*)::int as n from groups where id = $1`, [g])).n).toBe(1)
    expect((await one(`select status from members where group_id = $1 and person_id = $2`, [g, ben])).status).toBe('left')
    expect((await one(`select count(*)::int as n from bills where group_id = $1`, [g])).n).toBe(1)
  })

  it('removes groups nobody else is in, with their contacts and bills', async () => {
    const g = await makeGroup(ann, 'Solo', 'Ann Lee')
    await t.as(ann, () => t.sql(`insert into members (group_id, person_id, display_name) values ($1, $2, 'Sam')`, [g, randomUUID()]))
    await bill(ann, g, 'Lunch')
    await del(ann)
    expect((await one(`select count(*)::int as n from groups where id = $1`, [g])).n).toBe(0)
    expect((await one(`select count(*)::int as n from members where group_id = $1`, [g])).n).toBe(0)
    expect((await one(`select count(*)::int as n from bills where group_id = $1`, [g])).n).toBe(0)
  })

  it('removes a group where the only others never accepted their invite, and withdraws unanswered invites to you', async () => {
    const mine = await makeGroup(ann, 'Mine', 'Ann Lee')
    await t.as(ann, () => t.sql('select invite_user($1, $2)', [mine, ben])) // Ben never answers
    const theirs = await makeGroup(cat, 'Cats', 'Cat Doe')
    await t.as(cat, () => t.sql('select invite_user($1, $2)', [theirs, ann])) // Ann never answers
    await del(ann)
    expect((await one(`select count(*)::int as n from groups where id = $1`, [mine])).n).toBe(0)
    expect((await one(`select count(*)::int as n from members where group_id = $1 and person_id = $2`, [theirs, ann])).n).toBe(0)
    expect((await one(`select count(*)::int as n from groups where id = $1`, [theirs])).n).toBe(1)
  })

  it('removes your private data: alerts, notes, preferences and reminders', async () => {
    await t.as(ann, async () => {
      await t.sql(`insert into notes (user_id, id, data) values ($1, 'n1', '{"title":"x"}')`, [ann])
      await t.sql(`insert into prefs (user_id, layout) values ($1, '{"currency":"EUR"}')`, [ann])
    })
    await t.sql(`insert into notifs (user_id, data) values ($1, '{"text":"hi"}')`, [ann])
    await del(ann)
    for (const table of ['notes', 'prefs', 'notifs']) expect((await one(`select count(*)::int as n from ${table} where user_id = $1`, [ann])).n).toBe(0)
  })

  it('cannot be called by someone signed out', async () => {
    await expect(t.anon(() => t.sql('select delete_my_account()'))).rejects.toThrow()
  })

  it('only ever deletes the person asking', async () => {
    await del(ann)
    expect((await one(`select count(*)::int as n from auth.users where id in ($1, $2)`, [ben, cat])).n).toBe(2)
  })

  it('what the others see afterwards: the old member is a named former member, and the bill is still there', async () => {
    const g = await makeGroup(ann, 'Flat', 'Ann Lee')
    await join(g, ann, ben)
    const b1 = await bill(ann, g, 'Ann paid dinner')
    await t.as(ann, () => t.sql('select transfer_ownership($1, $2)', [g, ben]))
    await del(ann)
    const state = await createCloudRepository(pgliteDb(t, ben)).load()
    const l = state.ledgers.find((x) => x.id === g)
    expect(l?.owner).toBe('me')
    expect(l?.former).toContain(ann)
    expect(state.people[ann]?.name).toBe('Ann Lee')
    expect(l?.bills.map((b) => b.id)).toContain(b1)
    expect(l?.members).not.toContain(ann)
  })
})

import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, type TestDb } from './harness.ts'

let t: TestDb
let root: string
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
const bill = (uid: string, g: string) => {
  const id = randomUUID()
  return t.as(uid, () => t.sql(`insert into bills (id, group_id, bill_date, token, data) values ($1, $2, '2026-10-20', $3, '{"title":"x","shares":{}}')`, [id, g, `tok${id.replace(/-/g, '')}`])).then(() => id)
}
const n = async (text: string, params: unknown[] = []) => (await t.sql(text, params))[0].n as number

beforeEach(async () => {
  t = await createTestDb()
  root = await t.signUp('Root Admin', 'rootadmin')
  ann = await t.signUp('Ann Lee', 'ann')
  ben = await t.signUp('Ben Ray', 'ben')
  cat = await t.signUp('Cat Doe', 'cat')
  await t.sql('insert into public.admins (user_id) values ($1)', [root])
}, 60_000)

describe('removing accounts straight from Supabase (the dashboard or the SQL editor)', () => {
  it('works for someone who is in a group (this used to be refused by the column lock)', async () => {
    const g = await makeGroup(ann, 'Flat', 'Ann Lee')
    await join(g, ann, ben)
    await t.sql('delete from auth.users where id = $1', [ben])
    expect(await n('select count(*)::int as n from auth.users where id = $1', [ben])).toBe(0)
    // Ann's group carries on and Ben's seat is left as a nameless former row
    expect(await n('select count(*)::int as n from groups where id = $1', [g])).toBe(1)
    expect((await t.sql('select user_id, status from members where group_id = $1 and person_id = $2', [g, ben]))[0]).toMatchObject({ user_id: null })
  })

  it('works for someone who invited others', async () => {
    const g = await makeGroup(ann, 'Flat', 'Ann Lee')
    await t.as(ann, () => t.sql('select invite_user($1, $2)', [g, ben]))
    await t.sql('delete from auth.users where id = $1', [ann])
    expect(await n('select count(*)::int as n from auth.users where id = $1', [ann])).toBe(0)
  })

  it('can clear out everyone except the admin', async () => {
    const g1 = await makeGroup(ann, 'Flat', 'Ann Lee')
    await join(g1, ann, ben)
    await bill(ann, g1)
    await bill(ben, g1)
    const g2 = await makeGroup(cat, 'Cats', 'Cat Doe')
    await t.as(cat, () => t.sql('select invite_user($1, $2)', [g2, ann]))
    await t.as(ben, () => t.sql('select take_scan_credit()'))
    await t.sql(`select set_config('request.headers', '{"x-forwarded-for":"1.2.3.4"}', false)`)
    await t.as(ann, () => t.sql(`select submit_feedback('up', 'hello', '', '/home', 'test')`))
    await t.sql(`delete from auth.users where email <> 'rootadmin@example.com'`)
    expect(await n('select count(*)::int as n from auth.users')).toBe(1)
    expect(await n('select count(*)::int as n from public.profiles')).toBe(1)
    // the admin stays an admin; everything the others made is gone with their groups
    expect(await n('select count(*)::int as n from public.admins')).toBe(1)
    for (const table of ['groups', 'members', 'bills', 'scan_usage']) expect(await n(`select count(*)::int as n from public.${table}`)).toBe(0)
    // feedback is kept, no longer tied to anyone
    expect((await t.sql('select user_id from public.feedback'))[0].user_id).toBeNull()
  })

  it('the lock is back after a delete, so direct updates are still refused', async () => {
    const g = await makeGroup(ann, 'Flat', 'Ann Lee')
    const b = await bill(ann, g)
    await t.sql('delete from auth.users where id = $1', [cat])
    await expect(t.as(ann, () => t.sql(`update bills set token = 'aaaaaaaaaaaaaaaaaaaa' where id = $1`, [b]))).rejects.toThrow(/cannot be changed/)
  })
})

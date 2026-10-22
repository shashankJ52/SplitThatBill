import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, type TestDb } from './harness.ts'

let t: TestDb
let root: string
let ann: string
let ben: string

const overview = () => t.as(root, async () => (await t.sql('select admin_overview() as o'))[0].o as Record<string, Record<string, number> & { at: string }>)
const sendFeedback = (who: string | null, rating: string, message: string, ip: string) => {
  const run = () => t.sql(`select set_config('request.headers', $1, false)`, [JSON.stringify({ 'x-forwarded-for': ip })]).then(() => t.sql('select submit_feedback($1, $2, $3, $4, $5)', [rating, message, '', '/home', 'test']))
  return who ? t.as(who, run) : t.anon(run)
}

beforeEach(async () => {
  t = await createTestDb()
  root = await t.signUp('Root Admin', 'rootadmin')
  ann = await t.signUp('Ann Lee', 'ann')
  ben = await t.signUp('Ben Ray', 'ben')
  await t.sql('insert into public.admins (user_id) values ($1)', [root])
}, 60_000)

describe('who may use the admin functions', () => {
  it('only people listed as admins', async () => {
    for (const who of [ann, ben]) {
      for (const call of ['select admin_overview()', 'select * from admin_feedback()', 'select * from admin_users()']) {
        await expect(t.as(who, () => t.sql(call))).rejects.toThrow(/Admins only/)
      }
      await expect(t.as(who, () => t.sql('select admin_set_disabled($1, true)', [ben]))).rejects.toThrow(/Admins only/)
    }
    expect(await t.as(root, async () => (await t.sql('select is_admin() as a'))[0].a)).toBe(true)
    expect(await t.as(ann, async () => (await t.sql('select is_admin() as a'))[0].a)).toBe(false)
  })
  it('nobody signed out', async () => {
    await expect(t.anon(() => t.sql('select admin_overview()'))).rejects.toThrow()
    await expect(t.anon(() => t.sql('select * from admin_users()'))).rejects.toThrow()
  })
  it('the admin list itself cannot be read or edited from the app', async () => {
    await expect(t.as(ann, () => t.sql('select * from public.admins'))).rejects.toThrow()
    await expect(t.as(ann, () => t.sql('insert into public.admins (user_id) values ($1)', [ann]))).rejects.toThrow()
    await expect(t.as(root, () => t.sql('select * from public.admins'))).rejects.toThrow()
  })
})

describe('the numbers', () => {
  it('count people, activity, scans and feedback', async () => {
    const g = randomUUID()
    await t.as(ann, async () => {
      await t.sql(`insert into groups (id, kind, name, color, owner_id) values ($1, 'group', 'Flat', '#0039A6', $2)`, [g, ann])
      await t.sql(`insert into members (group_id, person_id, user_id, display_name, role, status) values ($1, $2, $2, 'Ann', 'owner', 'active')`, [g, ann])
      await t.sql(`insert into bills (id, group_id, bill_date, token, data) values ($1, $2, '2026-10-20', $3, '{"title":"x","shares":{}}')`, [randomUUID(), g, 'tok1'.padEnd(20, 'a')])
      await t.sql(`insert into bills (id, group_id, bill_date, token, data) values ($1, $2, '2026-10-20', $3, '{"title":"y","shares":{}}')`, [randomUUID(), g, 'tok2'.padEnd(20, 'a')])
      // one payment spread over two rows counts once
      await t.sql(`insert into payments (id, group_id, pay_date, data) values ($1, $2, '2026-10-20', '{"amt":5,"linkId":"L1"}'), ($3, $2, '2026-10-20', '{"amt":6,"linkId":"L1"}')`, [randomUUID(), g, randomUUID()])
      await t.sql('select take_scan_credit()')
      await t.sql('select take_scan_credit()')
    })
    await t.as(ben, () => t.sql('select take_scan_credit()'))
    await sendFeedback(ann, 'love', 'great', '10.0.0.1')
    await sendFeedback(null, 'down', 'bad', '10.0.0.2')
    await sendFeedback(null, 'down', 'worse', '10.0.0.3')
    const o = await overview()
    expect(o.users).toMatchObject({ total: 3, new7: 3, new30: 3, disabled: 0 })
    expect(o.groups).toMatchObject({ groups: 1, ones: 0 })
    expect(o.bills).toMatchObject({ total: 2, d7: 2, d30: 2 })
    expect(o.payments).toMatchObject({ total: 1, d7: 1 })
    expect(o.scans).toMatchObject({ total: 3, today: 3, d7: 3 })
    expect(o.feedback).toMatchObject({ total: 3, down: 2, up: 0, love: 1 })
    expect(Date.parse(o.at as unknown as string)).toBeGreaterThan(Date.now() - 60_000)
  })

  it('count a person who joined long ago only in the totals', async () => {
    await t.sql(`update public.profiles set created_at = now() - interval '40 days' where id = $1`, [ben])
    const o = await overview()
    expect(o.users).toMatchObject({ total: 3, new7: 2, new30: 2 })
  })
})

describe('the feedback inbox', () => {
  beforeEach(async () => {
    await sendFeedback(ann, 'love', 'Love the receipts', '10.0.0.1')
    await sendFeedback(null, 'down', 'The colors are hard to read', '10.0.0.2')
    await sendFeedback(null, 'up', '', '10.0.0.3')
  })
  const inbox = (only: string | null = null) => t.as(root, () => t.sql('select * from admin_feedback(100, $1)', [only]))

  it('lists newest first with who sent it when they were signed in', async () => {
    const rows = await inbox()
    expect(rows).toHaveLength(3)
    const mine = rows.find((r) => r.message === 'Love the receipts')
    expect(mine).toMatchObject({ rating: 'love', user_name: 'Ann Lee', user_tag: 'ann', page: '/home' })
    expect(rows.find((r) => r.message === 'The colors are hard to read')).toMatchObject({ rating: 'down', user_name: null })
  })
  it('can show only one kind', async () => {
    expect((await inbox('down')).map((r) => r.message)).toEqual(['The colors are hard to read'])
  })
  it('never returns more than asked', async () => {
    expect(await t.as(root, () => t.sql('select * from admin_feedback(2, null)'))).toHaveLength(2)
  })
})

describe('managing people', () => {
  it('lists everyone with what they have done', async () => {
    await t.as(ben, () => t.sql('select take_scan_credit()'))
    const rows = await t.as(root, () => t.sql('select * from admin_users()'))
    expect(rows.map((r) => r.tag).sort()).toEqual(['ann', 'ben', 'rootadmin'])
    expect(rows.find((r) => r.tag === 'ben')).toMatchObject({ name: 'Ben Ray', email: 'ben@example.com', scans: 1, disabled: false, is_admin: false })
    expect(rows.find((r) => r.tag === 'rootadmin')?.is_admin).toBe(true)
  })

  it('switches someone off and on, ending their open sessions', async () => {
    await t.sql('insert into auth.sessions (user_id) values ($1), ($1)', [ben])
    await t.as(root, () => t.sql('select admin_set_disabled($1, true)', [ben]))
    expect((await t.sql('select banned_until > now() as b from auth.users where id = $1', [ben]))[0].b).toBe(true)
    expect((await t.sql('select count(*)::int as n from auth.sessions where user_id = $1', [ben]))[0].n).toBe(0)
    expect((await t.as(root, () => t.sql('select * from admin_users()'))).find((r) => r.tag === 'ben')?.disabled).toBe(true)
    expect((await overview()).users.disabled).toBe(1)
    await t.as(root, () => t.sql('select admin_set_disabled($1, false)', [ben]))
    expect((await t.sql('select banned_until from auth.users where id = $1', [ben]))[0].banned_until).toBeNull()
    expect((await overview()).users.disabled).toBe(0)
  })

  it('deletes nothing of theirs', async () => {
    await t.as(ben, () => t.sql('select take_scan_credit()'))
    await t.as(root, () => t.sql('select admin_set_disabled($1, true)', [ben]))
    expect((await t.sql('select count(*)::int as n from public.profiles where id = $1', [ben]))[0].n).toBe(1)
    expect((await t.sql('select count(*)::int as n from public.scan_usage where user_id = $1', [ben]))[0].n).toBe(1)
  })

  it('refuses to switch off yourself, another admin, or someone who does not exist', async () => {
    await expect(t.as(root, () => t.sql('select admin_set_disabled($1, true)', [root]))).rejects.toThrow(/your own/)
    await t.sql('insert into public.admins (user_id) values ($1)', [ann])
    await expect(t.as(root, () => t.sql('select admin_set_disabled($1, true)', [ann]))).rejects.toThrow(/admin cannot/)
    await expect(t.as(root, () => t.sql('select admin_set_disabled($1, true)', [randomUUID()]))).rejects.toThrow(/No such user/)
  })
})

describe('users made in the Supabase dashboard', () => {
  it('get a name from their email and a generated tag instead of failing', async () => {
    const r = await t.sql(`insert into auth.users (email) values ('shashank.admin@splitthebill.com') returning id`)
    const p = (await t.sql('select name, tag, email from public.profiles where id = $1', [r[0].id]))[0]
    expect(p).toMatchObject({ name: 'Shashank Admin', email: 'shashank.admin@splitthebill.com' })
    expect(p.tag).toMatch(/^user[0-9a-f]{8}$/)
  })
  it('a sign-up from the app that sends a name but a bad tag still fails, as before', async () => {
    await expect(t.sql(`insert into auth.users (email, raw_user_meta_data) values ('x@example.com', '{"name":"X","tag":""}')`)).rejects.toThrow()
    await expect(t.sql(`insert into auth.users (email, raw_user_meta_data) values ('y@example.com', '{"name":"Y","tag":"ann"}')`)).rejects.toThrow()
  })
})

import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, type TestDb } from './harness.ts'

let t: TestDb
let ann: string
let ben: string
let cat: string
let g: string

const shares = (pid: string, n: number) => ({ [pid]: n })
const bill = (title: string, sh: Record<string, number> = {}) => ({ title, total: 1000, shares: sh, items: [], comments: [], by: 'me', token: 'x' })

/** Ann creates a group the way the app does: the group, then herself as owner. */
async function annCreatesGroup(name = 'Flat') {
  g = randomUUID()
  await t.as(ann, async () => {
    await t.sql(`insert into groups (id, kind, name, color, owner_id) values ($1, 'group', $2, '#0039A6', $3)`, [g, name, ann])
    await t.sql(`insert into members (group_id, person_id, user_id, display_name, role, status) values ($1, $2, $2, 'Ann', 'owner', 'active')`, [g, ann])
  })
}
const addBill = (uid: string, title: string, sh: Record<string, number> = {}, group = g) => {
  const id = randomUUID()
  return t.as(uid, () => t.sql(`insert into bills (id, group_id, bill_date, token, data) values ($1, $2, '2026-10-20', $3, $4) returning id`, [id, group, `tok${id.replace(/-/g, '')}`, JSON.stringify(bill(title, sh))])).then(() => id)
}
const fails = async (p: Promise<unknown>, text?: RegExp) => {
  await expect(p).rejects.toThrow(text)
}
const count = (uid: string, table: string) => t.as(uid, async () => (await t.sql(`select count(*)::int as n from ${table}`))[0].n as number)
const inviteAndAccept = async (who: string) => {
  await t.as(ann, () => t.sql('select invite_user($1, $2)', [g, who]))
  await t.as(who, () => t.sql('select accept_invite($1)', [g]))
}

beforeEach(async () => {
  t = await createTestDb()
  ann = await t.signUp('Ann Lee', 'ann')
  ben = await t.signUp('Ben Ray', 'ben')
  cat = await t.signUp('Cat Doe', 'cat')
}, 60_000)

describe('sign-up', () => {
  it('creates a profile and rejects a bad tag', async () => {
    expect((await t.sql(`select tag from profiles where id = $1`, [ann]))[0].tag).toBe('ann')
    await fails(t.signUp('X', 'admin'))
    await fails(t.signUp('X', 'ANN'))
  })
})

describe('privacy before anyone is invited', () => {
  beforeEach(() => annCreatesGroup())
  it('an outsider sees no group, member, bill, comment or payment', async () => {
    const b = await addBill(ann, 'Pizza')
    await t.as(ann, () => t.sql(`insert into payments (id, group_id, pay_date, data) values ($1, $2, '2026-10-20', '{"from":"a","to":"b","amt":500}')`, [randomUUID(), g]))
    for (const table of ['groups', 'members', 'bills', 'comments', 'payments', 'lists', 'list_items']) expect(await count(ben, table)).toBe(0)
    expect(await count(ann, 'bills')).toBe(1)
    expect(b).toBeTruthy()
  })
  it('an outsider cannot add a bill, member or comment to someone else\'s group', async () => {
    await fails(addBill(ben, 'Sneaky'), /row-level security/)
    await fails(t.as(ben, () => t.sql(`insert into members (group_id, person_id, user_id, display_name, role, status) values ($1, $2, $2, 'Ben', 'member', 'active')`, [g, ben])), /row-level security/)
  })
  it('nobody can create a group owned by someone else', async () => {
    await fails(t.as(ben, () => t.sql(`insert into groups (id, kind, name, owner_id) values ($1, 'group', 'Mine now', $2)`, [randomUUID(), ann])), /row-level security/)
  })
  it('a stranger cannot read another person\'s profile', async () => {
    await t.as(ben, async () => expect(await t.sql(`select id from profiles where id = $1`, [cat])).toEqual([]))
  })
  it('signed-out visitors can read nothing and call only the allowed functions', async () => {
    await t.anon(async () => {
      await fails(t.sql('select * from groups'), /permission denied/)
      await fails(t.sql('select * from notifs'), /permission denied/)
      await fails(t.sql(`select find_user_by_tag('ann')`), /permission denied/)
      await fails(t.sql(`select invite_user($1, $1)`, [g]), /permission denied/)
    })
  })
})

describe('finding people', () => {
  it('finds by exact tag and returns only name and tag', async () => {
    const r = await t.as(ben, () => t.sql(`select * from find_user_by_tag('@ANN')`))
    expect(r).toEqual([{ id: ann, name: 'Ann Lee', tag: 'ann' }])
    expect(await t.as(ben, () => t.sql(`select * from find_user_by_tag('an')`))).toEqual([])
  })
})

describe('invites need acceptance', () => {
  beforeEach(() => annCreatesGroup())
  it('the invited person sees nothing until accepting, then sees the group', async () => {
    const b = await addBill(ann, 'Pizza', shares(ben, 500))
    await t.as(ann, () => t.sql('select invite_user($1, $2)', [g, ben]))
    expect(await count(ben, 'bills')).toBe(0)
    expect(await count(ben, 'groups')).toBe(0)
    const alerts = await t.as(ben, () => t.sql(`select data from notifs`))
    expect(alerts).toHaveLength(1)
    expect((alerts[0].data as { kind: string }).kind).toBe('invite')
    await t.as(ben, () => t.sql('select accept_invite($1)', [g]))
    expect(await count(ben, 'bills')).toBe(1)
    expect(b).toBeTruthy()
  })
  it('declining keeps the person out', async () => {
    await t.as(ann, () => t.sql('select invite_user($1, $2)', [g, ben]))
    await t.as(ben, () => t.sql('select decline_invite($1)', [g]))
    await fails(t.as(ben, () => t.sql('select accept_invite($1)', [g])), /No invite/)
    expect(await count(ben, 'groups')).toBe(0)
  })
  it('nobody can accept an invite meant for someone else or accept without one', async () => {
    await fails(t.as(ben, () => t.sql('select accept_invite($1)', [g])), /No invite/)
    await t.as(ann, () => t.sql('select invite_user($1, $2)', [g, ben]))
    await fails(t.as(cat, () => t.sql('select accept_invite($1)', [g])), /No invite/)
  })
  it('a plain member cannot invite, only an admin or owner', async () => {
    await inviteAndAccept(ben)
    await fails(t.as(ben, () => t.sql('select invite_user($1, $2)', [g, cat])), /Only an admin/)
  })
  it('the inviter and invitee can read each other\'s name, and nobody else can', async () => {
    await t.as(ann, () => t.sql('select invite_user($1, $2)', [g, ben]))
    await t.as(ann, async () => expect(await t.sql(`select name from profiles where id = $1`, [ben])).toHaveLength(1))
    await t.as(cat, async () => expect(await t.sql(`select name from profiles where id = $1`, [ben])).toHaveLength(0))
  })
})

describe('members at work', () => {
  beforeEach(async () => {
    await annCreatesGroup()
    await inviteAndAccept(ben)
  })
  it('members add bills, only the creator edits or deletes them', async () => {
    const a = await addBill(ann, 'Ann bill')
    const b = await addBill(ben, 'Ben bill')
    expect(await count(ann, 'bills')).toBe(2)
    await t.as(ben, async () => {
      expect(await t.sql(`update bills set data = '{"title":"hacked"}' where id = $1 returning id`, [a])).toEqual([])
      expect(await t.sql(`delete from bills where id = $1 returning id`, [a])).toEqual([])
      expect(await t.sql(`update bills set data = '{"title":"fixed"}' where id = $1 returning id`, [b])).toHaveLength(1)
    })
    expect(await count(ann, 'bills')).toBe(2)
  })
  it('a bill cannot be moved, re-owned or given a new link', async () => {
    const b = await addBill(ben, 'Ben bill')
    await fails(t.as(ben, () => t.sql(`update bills set created_by = $2 where id = $1`, [b, ann])), /cannot be changed|row-level/)
    await fails(t.as(ben, () => t.sql(`update bills set token = 'aaaaaaaaaaaaaaaaaaaa' where id = $1`, [b])), /cannot be changed/)
    await fails(t.as(ben, () => t.sql(`update bills set group_id = $2 where id = $1`, [b, randomUUID()])), /cannot be changed|violates/)
  })
  it('comments reach the bill creator as an alert; commenting on a bill outside the group fails', async () => {
    const a = await addBill(ann, 'Ann bill')
    await t.as(ben, () => t.sql(`insert into comments (id, group_id, bill_id, text) values ($1, $2, $3, 'I did not have the nachos')`, [randomUUID(), g, a]))
    const alerts = await t.as(ann, () => t.sql(`select data from notifs`))
    expect(alerts.map((r) => (r.data as { text: string }).text)).toContain('Ben Ray commented on Ann bill')
    await fails(t.as(ben, () => t.sql(`insert into comments (id, group_id, bill_id, text) values ($1, $2, $3, 'x')`, [randomUUID(), g, randomUUID()])))
  })
  it('a new bill alerts the other members with their own share', async () => {
    await addBill(ann, 'Dinner', shares(ben, 2500))
    const alerts = await t.as(ben, () => t.sql(`select data from notifs`))
    const texts = alerts.map((r) => r.data as { text: string; sub: string })
    expect(texts.some((d) => d.text === 'Ann Lee added Dinner to Flat' && d.sub === 'Your share $25.00')).toBe(true)
    expect(await count(ann, 'notifs')).toBeGreaterThanOrEqual(1) // her invite-accepted alert only, none for her own bill
    const mine = await t.as(ann, () => t.sql(`select data from notifs`))
    expect(mine.some((r) => /added Dinner/.test((r.data as { text: string }).text))).toBe(false)
  })
  it('payments alert only the other side', async () => {
    await t.as(ben, () => t.sql(`insert into payments (id, group_id, pay_date, data) values ($1, $2, '2026-10-20', $3)`, [randomUUID(), g, JSON.stringify({ from: ben, to: ann, amt: 1250 })]))
    const annAlerts = await t.as(ann, () => t.sql(`select data from notifs`))
    expect(annAlerts.some((r) => /recorded a payment of \$12\.50/.test((r.data as { text: string }).text))).toBe(true)
  })
  it('alerts cannot be forged, but a person can read and delete their own', async () => {
    await fails(t.as(ben, () => t.sql(`insert into notifs (user_id, data) values ($1, '{"text":"fake"}')`, [ann])), /permission denied/)
    await addBill(ann, 'Dinner', shares(ben, 100))
    await t.as(ben, async () => {
      const mine = await t.sql(`select id from notifs`)
      expect(mine.length).toBeGreaterThan(0)
      await t.sql(`update notifs set data = data || '{"read":true}'`)
      await t.sql(`delete from notifs`)
      expect(await t.sql(`select id from notifs`)).toEqual([])
    })
    expect(await count(ann, 'notifs')).toBeGreaterThanOrEqual(1)
  })
  it('roles, status and ownership cannot be changed with a direct update', async () => {
    // a plain member has no update rights at all: nothing changes and nothing is returned
    await t.as(ben, async () => {
      expect(await t.sql(`update members set role = 'owner' where user_id = $1 returning 1`, [ben])).toEqual([])
      expect(await t.sql(`update groups set owner_id = $2 where id = $1 returning 1`, [g, ben])).toEqual([])
    })
    expect((await t.sql(`select role from members where user_id = $1 and group_id = $2`, [ben, g]))[0].role).toBe('member')
    // an admin may rename a contact, but cannot change its role or status with a direct update (only the functions can)
    const contact = randomUUID()
    await t.as(ann, () => t.sql(`insert into members (group_id, person_id, display_name) values ($1, $2, 'Sam')`, [g, contact]))
    await fails(t.as(ann, () => t.sql(`update members set role = 'admin' where person_id = $1`, [contact])), /cannot be changed/)
    await fails(t.as(ann, () => t.sql(`update members set status = 'removed' where person_id = $1`, [contact])), /cannot be changed/)
    await fails(t.as(ann, () => t.sql(`update groups set owner_id = $2 where id = $1`, [g, ben])), /cannot be changed/)
    await fails(t.as(ann, () => t.sql(`update groups set invite_code = 'mine' where id = $1`, [g])), /cannot be changed/)
  })
  it('only admins rename the group', async () => {
    await t.as(ben, async () => expect(await t.sql(`update groups set name = 'Mine' where id = $1 returning id`, [g])).toEqual([]))
    await t.as(ann, async () => expect(await t.sql(`update groups set name = 'Renamed' where id = $1 returning id`, [g])).toHaveLength(1))
  })
  it('only the owner can delete the group', async () => {
    await t.as(ben, async () => expect(await t.sql(`delete from groups where id = $1 returning id`, [g])).toEqual([]))
    await t.as(ann, async () => expect(await t.sql(`delete from groups where id = $1 returning id`, [g])).toHaveLength(1))
  })
  it('admins add contacts; members cannot; contacts can be renamed by admins only', async () => {
    const pid = randomUUID()
    const add = (uid: string) => t.as(uid, () => t.sql(`insert into members (group_id, person_id, display_name) values ($1, $2, 'Sam')`, [g, pid]))
    await fails(add(ben), /row-level/)
    await add(ann)
    await t.as(ann, () => t.sql(`update members set display_name = 'Samuel' where person_id = $1`, [pid]))
    await t.as(ben, async () => expect(await t.sql(`update members set display_name = 'Hack' where person_id = $1 returning 1`, [pid])).toEqual([]))
  })
  it('lists and ticks are shared; two people ticking different items do not clash', async () => {
    const l = randomUUID()
    const i1 = randomUUID()
    const i2 = randomUUID()
    await t.as(ann, async () => {
      await t.sql(`insert into lists (id, group_id, title) values ($1, $2, 'Costco')`, [l, g])
      await t.sql(`insert into list_items (id, group_id, list_id, text) values ($1, $2, $3, 'Paper towels'), ($4, $2, $3, 'Eggs')`, [i1, g, l, i2])
    })
    await t.as(ben, () => t.sql(`update list_items set done = true, done_by = $2 where id = $1`, [i1, ben]))
    await t.as(ann, () => t.sql(`update list_items set done = true, done_by = $2 where id = $1`, [i2, ann]))
    const rows = await t.as(cat, async () => (await t.sql(`select count(*)::int as n from list_items`))[0].n)
    expect(rows).toBe(0)
    expect(await count(ben, 'list_items')).toBe(2)
    expect((await t.as(ann, () => t.sql(`select done from list_items where done`))).length).toBe(2)
  })
})

describe('the group link', () => {
  beforeEach(async () => {
    await annCreatesGroup('Trip')
    await inviteAndAccept(ben)
  })
  it('a plain member cannot turn the link on or off', async () => {
    await fails(t.as(ben, () => t.sql('select set_invite_link($1, true)', [g])), /Only an admin/)
  })
  it('a visitor sees only the group name and who runs it, requests, and nothing else until approved', async () => {
    const code = (await t.as(ann, () => t.sql('select set_invite_link($1, true) as c', [g])))[0].c as string
    expect(code).toHaveLength(32)
    const prev = await t.as(cat, () => t.sql('select * from group_preview($1)', [code]))
    expect(prev).toEqual([{ group_name: 'Trip', owner_name: 'Ann Lee' }])
    expect(await t.as(cat, () => t.sql(`select * from group_preview('wrong')`))).toEqual([])
    const res = await t.as(cat, () => t.sql('select request_join($1) as r', [code]))
    expect(res[0].r).toBe('requested')
    expect(await count(cat, 'bills')).toBe(0)
    expect(await count(cat, 'members')).toBe(0)
    const adminAlerts = await t.as(ann, () => t.sql(`select data from notifs`))
    expect(adminAlerts.some((r) => (r.data as { kind?: string }).kind === 'join_request')).toBe(true)
    await t.as(ann, async () => expect(await t.sql(`select name from profiles where id = $1`, [cat])).toHaveLength(1))
  })
  it('only admins approve; approval makes the person a member; a denial keeps them out', async () => {
    const code = (await t.as(ann, () => t.sql('select set_invite_link($1, true) as c', [g])))[0].c as string
    await t.as(cat, () => t.sql('select request_join($1)', [code]))
    await fails(t.as(ben, () => t.sql('select decide_join($1, $2, true)', [g, cat])), /Only an admin/)
    await fails(t.as(cat, () => t.sql('select decide_join($1, $2, true)', [g, cat])), /Only an admin/)
    await t.as(ann, () => t.sql('select decide_join($1, $2, true)', [g, cat]))
    await addBill(ann, 'Hotel')
    expect(await count(cat, 'bills')).toBe(1)
  })
  it('denied requests stay out, and turning the link off or making a new one kills the old code', async () => {
    const code = (await t.as(ann, () => t.sql('select set_invite_link($1, true) as c', [g])))[0].c as string
    await t.as(cat, () => t.sql('select request_join($1)', [code]))
    await t.as(ann, () => t.sql('select decide_join($1, $2, false)', [g, cat]))
    expect(await count(cat, 'bills')).toBe(0)
    const next = (await t.as(ann, () => t.sql('select set_invite_link($1, true) as c', [g])))[0].c as string
    expect(next).not.toBe(code)
    await fails(t.as(cat, () => t.sql('select request_join($1)', [code])), /not valid/)
    await t.as(ann, () => t.sql('select set_invite_link($1, false)', [g]))
    await fails(t.as(cat, () => t.sql('select request_join($1)', [next])), /not valid/)
  })
  it('a visitor cannot approve themselves by writing to join_requests', async () => {
    const code = (await t.as(ann, () => t.sql('select set_invite_link($1, true) as c', [g])))[0].c as string
    await t.as(cat, () => t.sql('select request_join($1)', [code]))
    await fails(t.as(cat, () => t.sql(`update join_requests set status = 'approved'`)), /permission denied/)
    await fails(t.as(cat, () => t.sql(`insert into join_requests (group_id, user_id, status) values ($1, $2, 'approved')`, [g, cat])), /permission denied/)
  })
})

describe('admins, removal and leaving', () => {
  beforeEach(async () => {
    await annCreatesGroup('Crew')
    await inviteAndAccept(ben)
    await inviteAndAccept(cat)
  })
  it('only the owner makes admins; admins can remove members but not the owner or another admin', async () => {
    await fails(t.as(ben, () => t.sql(`select set_role($1, $2, 'admin')`, [g, ben])), /Only the owner/)
    await t.as(ann, () => t.sql(`select set_role($1, $2, 'admin')`, [g, ben]))
    await t.as(ann, () => t.sql(`select set_role($1, $2, 'admin')`, [g, cat]))
    await fails(t.as(ben, () => t.sql('select remove_member($1, $2)', [g, ann])), /owner cannot be removed/)
    await fails(t.as(ben, () => t.sql('select remove_member($1, $2)', [g, cat])), /Only the owner can remove an admin/)
    await t.as(ann, () => t.sql('select remove_member($1, $2)', [g, cat]))
  })
  it('removal keeps history, cuts off access, and the person is listed as removed', async () => {
    const b = await addBill(cat, 'Cat paid')
    await t.as(ann, () => t.sql('select remove_member($1, $2)', [g, cat]))
    expect(await count(cat, 'bills')).toBe(0)
    expect(await count(cat, 'groups')).toBe(0)
    await fails(addBill(cat, 'After removal'), /row-level/)
    expect(await count(ann, 'bills')).toBe(1)
    const m = await t.as(ann, () => t.sql(`select display_name, status from members where person_id = $1`, [cat]))
    expect(m).toEqual([{ display_name: 'Cat Doe', status: 'removed' }])
    expect(b).toBeTruthy()
    const alerts = await t.as(cat, () => t.sql(`select data from notifs`))
    expect(alerts.some((r) => /removed from Crew/.test((r.data as { text: string }).text))).toBe(true)
  })
  it('a plain member cannot remove anyone', async () => {
    await fails(t.as(ben, () => t.sql('select remove_member($1, $2)', [g, cat])), /Only an admin/)
  })
  it('a removed person can be invited back', async () => {
    await t.as(ann, () => t.sql('select remove_member($1, $2)', [g, cat]))
    await inviteAndAccept(cat)
    await addBill(ann, 'Welcome back')
    expect(await count(cat, 'bills')).toBe(1)
  })
  it('members can leave; the owner must transfer first, then the new owner has the rights', async () => {
    await t.as(ben, () => t.sql('select leave_group($1)', [g]))
    expect(await count(ben, 'groups')).toBe(0)
    await fails(t.as(ann, () => t.sql('select leave_group($1)', [g])), /Transfer ownership/)
    await fails(t.as(cat, () => t.sql('select transfer_ownership($1, $2)', [g, cat])), /Only the owner/)
    await fails(t.as(ann, () => t.sql('select transfer_ownership($1, $2)', [g, ben])), /active member/)
    await t.as(ann, () => t.sql('select transfer_ownership($1, $2)', [g, cat]))
    await t.as(ann, () => t.sql('select leave_group($1)', [g]))
    await t.as(cat, () => t.sql('select set_invite_link($1, true)', [g]))
    await t.as(cat, async () => expect(await t.sql(`update groups set name = 'Cat crew' where id = $1 returning 1`, [g])).toHaveLength(1))
  })
})

describe('reminders', () => {
  beforeEach(async () => {
    await annCreatesGroup()
    await inviteAndAccept(ben)
  })
  it('reach only the person they are for, once an hour', async () => {
    await t.as(ann, () => t.sql(`select send_reminder($1, $2, 1250, 'Hey Ben, you owe me')`, [g, ben]))
    const got = await t.as(ben, () => t.sql(`select data from notifs`))
    const r = got.map((x) => x.data as { kind?: string; msg?: string; sub?: string }).find((d) => d.kind === 'remind')
    expect(r?.msg).toBe('Hey Ben, you owe me')
    expect(r?.sub).toBe('Flat · $12.50')
    expect((await t.as(ann, () => t.sql(`select data from notifs`))).some((x) => (x.data as { kind?: string }).kind === 'remind')).toBe(false)
    await fails(t.as(ann, () => t.sql(`select send_reminder($1, $2, 1250, 'again')`, [g, ben])), /already sent/)
  })
  it('refuses outsiders, yourself, and people without the app', async () => {
    await fails(t.as(cat, () => t.sql(`select send_reminder($1, $2, 100, 'x')`, [g, ben])), /Not a member/)
    await fails(t.as(ann, () => t.sql(`select send_reminder($1, $2, 100, 'x')`, [g, ann])), /yourself/)
    const contact = randomUUID()
    await t.as(ann, () => t.sql(`insert into members (group_id, person_id, display_name) values ($1, $2, 'Sam')`, [g, contact]))
    await fails(t.as(ann, () => t.sql(`select send_reminder($1, $2, 100, 'x')`, [g, contact])), /cannot get reminders/)
  })
})

describe('reminders in a 1-1 split', () => {
  it('reach the other person when you have no group together', async () => {
    const one = randomUUID()
    await t.as(ann, async () => {
      await t.sql(`insert into groups (id, kind, owner_id) values ($1, 'one', $2)`, [one, ann])
      await t.sql(`insert into members (group_id, person_id, user_id, display_name, role, status) values ($1, $2, $2, 'Ann', 'owner', 'active')`, [one, ann])
      await t.sql('select invite_user($1, $2)', [one, ben])
    })
    await t.as(ben, () => t.sql('select accept_invite($1)', [one]))
    await t.as(ann, () => t.sql(`select send_reminder($1, $2, 2500, 'Hey Ben, you owe me')`, [one, ben]))
    const got = await t.as(ben, () => t.sql(`select data from notifs`))
    const r = got.map((x) => x.data as { kind?: string; msg?: string; sub?: string }).find((d) => d.kind === 'remind')
    expect(r?.msg).toBe('Hey Ben, you owe me')
    expect(r?.sub).toBe('a 1-1 split · $25.00')
  })
  it('cannot go to someone who has been invited but has not accepted', async () => {
    const one = randomUUID()
    await t.as(ann, async () => {
      await t.sql(`insert into groups (id, kind, owner_id) values ($1, 'one', $2)`, [one, ann])
      await t.sql(`insert into members (group_id, person_id, user_id, display_name, role, status) values ($1, $2, $2, 'Ann', 'owner', 'active')`, [one, ann])
      await t.sql('select invite_user($1, $2)', [one, ben])
    })
    await fails(t.as(ann, () => t.sql(`select send_reminder($1, $2, 100, 'x')`, [one, ben])), /cannot get reminders/)
  })
})

describe('the public bill link', () => {
  beforeEach(() => annCreatesGroup())
  it('shows the bill and first names only, to anyone, without logging in', async () => {
    await inviteAndAccept(ben)
    const id = randomUUID()
    const token = 'public-token-123456'
    await t.as(ann, () => t.sql(`insert into bills (id, group_id, bill_date, token, data) values ($1, $2, '2026-10-20', $3, $4)`, [id, g, token, JSON.stringify({ ...bill('Dinner'), comments: [{ text: 'secret' }], by: ann })]))
    const out = await t.anon(async () => (await t.sql('select public_bill($1) as b', [token]))[0].b as { bill: Record<string, unknown>; names: Record<string, string> })
    expect(out.bill.title).toBe('Dinner')
    expect(out.bill.comments).toBeUndefined()
    expect(out.bill.token).toBeUndefined()
    expect(out.names[ann]).toBe('Ann')
    expect(out.names[ben]).toBe('Ben')
    expect(JSON.stringify(out)).not.toMatch(/example\.com|secret|Lee|Ray/)
    expect(await t.anon(async () => (await t.sql(`select public_bill('nope-nope-nope') as b`))[0].b)).toBeNull()
  })
})

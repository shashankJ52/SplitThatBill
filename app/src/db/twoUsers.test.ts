/**
 * Several people using the app at once, against a local copy of the database that runs the real migrations. Each Client
 * behaves like one phone: the app's own sync code, plus the same follow-up steps the app takes after a save
 * (invite whoever was just added) and the same reload after a database call.
 */
import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import * as A from '../data/actions'
import { createCloudRepository, type CloudRepository } from '../data/cloud/cloudRepository.ts'
import { makeBill } from '../domain/bills'
import { billWithCredit } from '../domain/draft'
import { linkTargets, pendingInvites, placeholdersIn } from '../domain/membership'
import { alertTarget, findBill, pairBalance, personalLedger, personName, shownPeople, splitPeople } from '../domain/selectors'
import type { AppBill, AppLedger, AppState, Comment, NoteList } from '../domain/types'
import { ME } from '../domain/types'
import { nets, transfers } from '../money'
import { createTestDb, type TestDb } from './harness.ts'
import { pgliteDb } from './pgliteDb.ts'

let t: TestDb

class Client {
  uid: string
  state: AppState
  rejected = 0
  private repo: CloudRepository
  private constructor(uid: string, state: AppState, repo: CloudRepository) {
    this.uid = uid
    this.state = state
    this.repo = repo
  }
  static async open(uid: string): Promise<Client> {
    const box: { c?: Client } = {}
    const repo = createCloudRepository(pgliteDb(t, uid), () => { if (box.c) box.c.rejected++ })
    box.c = new Client(uid, await repo.load(), repo)
    return box.c
  }
  get s(): AppState { return this.state }
  /** change something and let it save, as the app's store does a moment after an edit */
  async do(fn: (s: AppState) => AppState) {
    this.state = fn(this.state)
    await this.repo.save(this.state)
  }
  /** change something without saving yet */
  edit(fn: (s: AppState) => AppState) { this.state = fn(this.state) }
  async reload() { this.state = await this.repo.load() }
  /** what the app does after a save: invite whoever was added, then show what the server holds */
  async settle() {
    await this.repo.save(this.state)
    for (const x of pendingInvites(this.state)) await t.as(this.uid, () => t.sql('select invite_user($1, $2)', [x.gid, x.pid]))
    await this.reload()
  }
  /** a database function, then reload, as the app does for accepting, linking and so on */
  async rpc(text: string, params: unknown[] = []) {
    await this.repo.save(this.state)
    await t.as(this.uid, () => t.sql(text, params))
    await this.reload()
  }
  ledger(name: string): AppLedger { return this.state.ledgers.find((l) => l.name === name) as AppLedger }
}

const group = (id: string, name: string, members: string[]) => ({ id, name, color: '#0039A6', simplify: true, members, currency: 'USD' })
const bill = (title: string, payer: string, people: string[], total: number, extra: Partial<AppBill> = {}) =>
  makeBill({ id: randomUUID(), title, date: '2026-10-20', payer, by: ME, rt: total, people, items: [{ id: 1, name: title, qty: 1, price: total, a: { mode: 'even', even: people, por: {} } }], ...extra })
const sum = (o: Record<string, number>) => Object.values(o).reduce((a, v) => a + v, 0)

let ann: string, ben: string, cat: string

beforeEach(async () => {
  t = await createTestDb()
  ann = await t.signUp('Ann Lee', 'ann')
  ben = await t.signUp('Ben Ray', 'ben')
  cat = await t.signUp('Cat Doe', 'cat')
}, 60_000)

/** Ann makes "Flat" with Ben (found by tag) and a placeholder for Sam, Ben accepts. Returns both phones and the group id. */
async function flat() {
  const a = await Client.open(ann)
  const sam = randomUUID()
  const g = randomUUID()
  await a.do((s) => ({ ...A.rememberFriend(s, { id: ben, name: 'Ben Ray', tag: 'ben' }), people: { ...A.rememberFriend(s, { id: ben, name: 'Ben Ray', tag: 'ben' }).people, [sam]: { id: sam, name: 'Sam', user: false } } }))
  await a.do((s) => A.createGroup(s, group(g, 'Flat', [ME, ben, sam])))
  await a.settle()
  const b = await Client.open(ben)
  await b.rpc('select accept_invite($1)', [g])
  await a.reload()
  return { a, b, g, sam }
}

describe('two people invite, accept and share a group', () => {
  it('the invite arrives, the group stays hidden until accepted, then both see the same group', async () => {
    const a = await Client.open(ann)
    const g = randomUUID()
    await a.do((s) => A.rememberFriend(s, { id: ben, name: 'Ben Ray', tag: 'ben' }))
    await a.do((s) => A.createGroup(s, group(g, 'Flat', [ME, ben])))
    await a.settle()
    expect(a.ledger('Flat').invited).toEqual([ben])
    expect(shownPeople(a.ledger('Flat'))).toContain(ben) // still part of the group while invited
    const b = await Client.open(ben)
    expect(b.s.ledgers).toHaveLength(0)
    expect(b.s.notifs.some((n) => n.kind === 'invite' && n.gid === g)).toBe(true)
    await b.rpc('select accept_invite($1)', [g])
    await a.reload()
    expect(b.ledger('Flat').members.sort()).toEqual([ME, ann].sort())
    expect(a.ledger('Flat').members.sort()).toEqual([ME, ben].sort())
    expect(a.ledger('Flat').invited ?? []).toEqual([])
    expect(a.s.people[ben]?.name).toBe('Ben Ray')
    expect(b.s.people[ann]?.name).toBe('Ann Lee')
  })

  it('a person found by tag is still known after a fresh start of the app on another device', async () => {
    const a = await Client.open(ann)
    await a.do((s) => A.rememberFriend(s, { id: cat, name: 'Cat Doe', tag: 'cat' }))
    const phone2 = await Client.open(ann)
    expect(phone2.s.people[cat]).toMatchObject({ name: 'Cat Doe', tag: 'cat', user: true })
  })
})

describe('both add bills at the same moment', () => {
  it('no bill is lost, both screens agree, and the balances cancel out', async () => {
    const { a, b, g } = await flat()
    const la = a.ledger('Flat').id
    await Promise.all([
      a.do((s) => A.addBill(s, la, bill('Groceries', ME, [ME, ben], 6000))),
      b.do((s) => A.addBill(s, g, bill('Internet', ME, [ME, ann], 4000))),
    ])
    await Promise.all([a.reload(), b.reload()])
    expect(a.ledger('Flat').bills.map((x) => x.title).sort()).toEqual(['Groceries', 'Internet'])
    expect(b.ledger('Flat').bills.map((x) => x.title).sort()).toEqual(['Groceries', 'Internet'])
    // Ann paid 60 split with Ben (Ben owes 30); Ben paid 40 split with Ann (Ann owes 20): Ben owes Ann 10
    expect(nets(a.ledger('Flat'))[ben]).toBe(-1000)
    expect(nets(b.ledger('Flat'))[ann]).toBe(1000)
    expect(sum(nets(a.ledger('Flat')))).toBe(0)
    expect(transfers(a.ledger('Flat'))).toEqual([{ from: ben, to: ME, amt: 1000 }])
    expect(transfers(b.ledger('Flat'))).toEqual([{ from: ME, to: ann, amt: 1000 }])
  })

  it('comments and an edit made at the same time both survive', async () => {
    const { a, b, g } = await flat()
    const la = a.ledger('Flat').id
    const bl = bill('Dinner', ME, [ME, ben], 8000)
    await a.do((s) => A.addBill(s, la, bl))
    await b.reload()
    const note: Comment = { id: randomUUID(), by: ME, text: 'I had the salad only', ts: Date.now() }
    await Promise.all([
      b.do((s) => A.addComment(s, bl.id, note)),
      a.do((s) => A.replaceBill(s, { ...(findBill(a.s, bl.id)!.bill), title: 'Dinner at Luigi’s' })),
    ])
    await Promise.all([a.reload(), b.reload()])
    for (const c of [a, b]) {
      const f = findBill(c.s, bl.id)!.bill
      expect(f.title).toBe('Dinner at Luigi’s')
      expect(f.comments.map((x) => x.text)).toContain('I had the salad only')
    }
    expect(g).toBeTruthy()
  })

  it('someone cannot change or delete another person’s bill, and the refusal is shown as what is really stored', async () => {
    const { a, b } = await flat()
    const la = a.ledger('Flat').id
    const bl = bill('Rent', ME, [ME, ben], 100000)
    await a.do((s) => A.addBill(s, la, bl))
    await b.reload()
    const before = b.rejected
    await b.do((s) => A.replaceBill(s, { ...findBill(s, bl.id)!.bill, title: 'Hacked', rt: 1, total: 1 }))
    await b.do((s) => A.deleteBill(s, bl.id))
    await b.reload()
    expect(b.rejected).toBeGreaterThanOrEqual(before)
    expect(findBill(b.s, bl.id)?.bill.title).toBe('Rent')
    await a.reload()
    expect(findBill(a.s, bl.id)?.bill).toMatchObject({ title: 'Rent', rt: 100000 })
  })
})

describe('a placeholder name is linked to a real account', () => {
  it('keeps every balance exactly as it was, then the new person accepts and sees the same numbers', async () => {
    const { a, sam } = await flat()
    const la = a.ledger('Flat').id
    await a.do((s) => A.addBill(s, la, bill('Pizza', sam, [ME, sam, ben], 9000)))
    await a.do((s) => A.addBill(s, la, bill('Taxi', ME, [ME, sam], 3000)))
    const before = nets(a.ledger('Flat'))
    expect(linkTargets(a.s, sam)).toEqual([la])
    a.edit((s) => A.rememberFriend(s, { id: cat, name: 'Cat Doe', tag: 'cat' }))
    await a.rpc('select link_contact($1, $2, $3)', [la, sam, cat])
    const after = nets(a.ledger('Flat'))
    expect(after[cat]).toBe(before[sam]) // the same money, now under Cat
    expect(after[sam]).toBeUndefined()
    expect(after[ben]).toBe(before[ben])
    expect(shownPeople(a.ledger('Flat'))).toContain(cat)
    expect(a.ledger('Flat').members).not.toContain(sam)
    const c = await Client.open(cat)
    expect(c.s.ledgers).toHaveLength(0) // nothing until she accepts
    await c.rpc('select accept_invite($1)', [la])
    expect(nets(c.ledger('Flat'))[ME]).toBe(before[sam])
    expect(sum(nets(c.ledger('Flat')))).toBe(0)
    expect(c.ledger('Flat').bills.map((x) => x.title).sort()).toEqual(['Pizza', 'Taxi'])
  })
})

describe('joining with the group link', () => {
  it('asks, is approved by the admin, and then sees the bills', async () => {
    const { a, g } = await flat()
    const la = a.ledger('Flat').id
    await a.do((s) => A.addBill(s, la, bill('Groceries', ME, [ME, ben], 6000)))
    const code = a.ledger('Flat').inviteCode as string
    expect(code).toMatch(/^[0-9a-f]{32}$/)
    const c = await Client.open(cat)
    await c.rpc('select request_join($1)', [code])
    expect(c.s.ledgers).toHaveLength(0)
    await a.reload()
    expect(a.ledger('Flat').requests?.map((r) => r.pid)).toEqual([cat])
    await a.rpc('select decide_join($1, $2, true)', [g, cat])
    await c.reload()
    expect(c.ledger('Flat').bills).toHaveLength(1)
    expect(a.ledger('Flat').requests ?? []).toEqual([])
  })
})

describe('personal spending stays private', () => {
  it('each person has their own, neither can see the other’s, and it never touches what they owe', async () => {
    const { a, b } = await flat()
    await a.do((s) => A.ensurePersonal(s, randomUUID()).state)
    await b.do((s) => A.ensurePersonal(s, randomUUID()).state)
    const pa = personalLedger(a.s)!.id
    const pb = personalLedger(b.s)!.id
    await a.do((s) => A.addBill(s, pa, bill('Haircut', ME, [ME], 2500)))
    await b.do((s) => A.addBill(s, pb, bill('Gym', ME, [ME], 4000)))
    await Promise.all([a.reload(), b.reload()])
    expect(personalLedger(a.s)!.bills.map((x) => x.title)).toEqual(['Haircut'])
    expect(personalLedger(b.s)!.bills.map((x) => x.title)).toEqual(['Gym'])
    expect(a.s.ledgers.filter((l) => l.kind === 'me')).toHaveLength(1)
    expect(await t.as(ben, () => t.sql('select count(*)::int as n from bills where data::text like $1', ['%Haircut%']))).toEqual([{ n: 0 }])
  })

  it('opening Personal on two devices at once still gives one ledger', async () => {
    const phone = await Client.open(ann)
    const laptop = await Client.open(ann)
    await Promise.all([phone.do((s) => A.ensurePersonal(s, ann).state), laptop.do((s) => A.ensurePersonal(s, ann).state)])
    await Promise.all([phone.reload(), laptop.reload()])
    expect(phone.s.ledgers.filter((l) => l.kind === 'me')).toHaveLength(1)
    expect(laptop.s.ledgers.filter((l) => l.kind === 'me')).toHaveLength(1)
  })
})

describe('an extra discount on a shared bill', () => {
  it('everyone sees the same lower total and shares, and the balances still cancel', async () => {
    const { a, b } = await flat()
    const la = a.ledger('Flat').id
    const bl = bill('Dinner', ME, [ME, ben], 10000)
    await a.do((s) => A.addBill(s, la, bl))
    const l = a.ledger('Flat')
    const note: Comment = { id: randomUUID(), by: ME, text: 'x', ts: 1, sys: true }
    await a.do((s) => A.replaceBill(s, billWithCredit(findBill(s, bl.id)!.bill, l, { name: 'Cashback', m: 'pct', v: 20 }, note)))
    await b.reload()
    const fa = findBill(a.s, bl.id)!.bill
    const fb = findBill(b.s, bl.id)!.bill
    expect(fb.total).toBe(8000)
    expect(fb.credits).toEqual(fa.credits)
    expect(nets(b.ledger('Flat'))[ann]).toBe(4000)
    expect(nets(a.ledger('Flat'))[ben]).toBe(-4000)
    expect(sum(nets(b.ledger('Flat')))).toBe(0)
  })
})

describe('a shared checklist ticked and added to at the same moment', () => {
  it('nothing is lost, and each tick is credited to the right person on both screens', async () => {
    const { a, b } = await flat()
    const la = a.ledger('Flat').id
    const list: NoteList = { id: randomUUID(), title: 'Costco', memo: '', ts: Date.now(), items: [{ id: randomUUID(), t: 'milk', done: false, doneBy: null }, { id: randomUUID(), t: 'eggs', done: false, doneBy: null }] }
    await a.do((s) => A.saveNote(s, list, null, `g:${la}`))
    await b.reload()
    const [milk, eggs] = list.items.map((i) => i.id)
    await Promise.all([
      b.do((s) => A.toggleNoteItem(s, { ctx: 'g', gid: la }, list.id, milk, ME)),
      a.do((s) => A.toggleNoteItem(s, { ctx: 'g', gid: la }, list.id, eggs, ME)),
    ])
    await Promise.all([a.reload(), b.reload()])
    const items = (c: Client) => Object.fromEntries((c.ledger('Flat').lists[0].items).map((i) => [i.t, [i.done, i.doneBy]]))
    expect(items(a)).toEqual({ milk: [true, ben], eggs: [true, ME] })
    expect(items(b)).toEqual({ milk: [true, ME], eggs: [true, ann] })
  })
})

describe('who may change the group', () => {
  it('the owner can rename it and change its currency; a member cannot, and sees what is really stored', async () => {
    const { a, b } = await flat()
    await b.do((s) => A.updateGroup(s, b.ledger('Flat').id, { name: 'Ben’s flat', currency: 'EUR' }))
    await b.reload()
    expect(b.ledger('Flat').name).toBe('Flat')
    await a.do((s) => A.updateGroup(s, a.ledger('Flat').id, { name: 'Our flat', currency: 'EUR' }))
    await b.reload()
    expect(b.ledger('Our flat').currency).toBe('EUR')
  })

  it('a member cannot invite people or add placeholder names to the group', async () => {
    const { b, g } = await flat()
    await expect(t.as(ben, () => t.sql('select invite_user($1, $2)', [g, cat]))).rejects.toThrow(/Only an admin/)
    await expect(t.as(ben, () => t.sql(`insert into members (group_id, person_id, user_id, display_name, role, status) values ($1, $2, null, 'Ghost', 'member', 'active')`, [g, randomUUID()]))).rejects.toThrow()
    expect(b.rejected).toBe(0)
  })
})

describe('leaving, being removed and declining', () => {
  it('after Ben leaves, his bills and name stay for Ann and he sees nothing', async () => {
    const { a, b, g } = await flat()
    const la = a.ledger('Flat').id
    await b.do((s) => A.addBill(s, g, bill('Ben’s round', ME, [ME, ann], 4000)))
    await b.rpc('select leave_group($1)', [g])
    await a.reload()
    expect(b.s.ledgers).toHaveLength(0)
    expect(a.ledger('Flat').former).toContain(ben)
    expect(findBill(a.s, a.ledger('Flat').bills[0].id)?.bill.title).toBe('Ben’s round')
    expect(personName(a.s, ben)).toBe('Ben Ray')
    expect(nets(a.ledger('Flat'))[ben]).toBe(2000) // he is still owed his half until it is settled
    expect(la).toBe(g)
  })

  it('a declined invite can be sent again, and removing someone keeps their history', async () => {
    const { a, g } = await flat()
    await a.do((s) => A.updateGroup(s, g, { members: [...a.ledger('Flat').members, cat] }))
    await a.edit((s) => A.rememberFriend(s, { id: cat, name: 'Cat Doe', tag: 'cat' }))
    await a.settle()
    const c = await Client.open(cat)
    await c.rpc('select decline_invite($1)', [g])
    await a.reload()
    expect(a.ledger('Flat').invited ?? []).not.toContain(cat)
    await a.rpc('select invite_user($1, $2)', [g, cat])
    expect(a.ledger('Flat').invited).toEqual([cat])
    await c.reload()
    await c.rpc('select accept_invite($1)', [g])
    await a.rpc('select remove_member($1, $2)', [g, cat])
    expect(a.ledger('Flat').former).toContain(cat)
    await c.reload()
    expect(c.s.ledgers).toHaveLength(0)
  })
})

describe('splitting one-on-one', () => {
  it('Ann starts a 1-1 with Ben, he accepts, and both see the same balance', async () => {
    const a = await Client.open(ann)
    await a.do((s) => A.rememberFriend(s, { id: ben, name: 'Ben Ray', tag: 'ben' }))
    const lid = randomUUID()
    await a.do((s) => A.ensureOneLedger(s, ben, lid).state)
    await a.do((s) => A.addBill(s, lid, bill('Coffee', ME, [ME, ben], 1000)))
    await a.settle()
    const b = await Client.open(ben)
    await b.rpc('select accept_invite($1)', [lid])
    expect(pairBalance(a.s, ben).tot).toBe(500)
    expect(pairBalance(b.s, ann).tot).toBe(-500)
    // Ben pays it back, Ann sees it, and both are square
    await b.do((s) => A.addPayment(s, lid, { id: randomUUID(), from: ME, to: ann, amt: 500, date: '2026-10-21', note: 'Zelle', by: ME }))
    await a.reload()
    expect(pairBalance(a.s, ben).tot).toBe(0)
    expect(pairBalance(b.s, ann).tot).toBe(0)
  })
})

describe('payments and reminders', () => {
  it('a payment settles the balance for both, and a reminder arrives as an alert', async () => {
    const { a, b, g } = await flat()
    await a.do((s) => A.addBill(s, g, bill('Groceries', ME, [ME, ben], 6000)))
    await b.reload()
    expect(nets(b.ledger('Flat'))[ME]).toBe(-3000)
    await t.as(ann, () => t.sql('select send_reminder($1, $2, $3, $4)', [g, ben, 3000, 'Rent day!']))
    await b.reload()
    const alert = b.s.notifs.find((n) => n.kind === 'remind')
    expect(alert).toBeTruthy()
    expect(alertTarget(b.s, alert!)).toBeTruthy()
    await b.do((s) => A.addPayment(s, g, { id: randomUUID(), from: ME, to: ann, amt: 3000, date: '2026-10-21', note: '', by: ME }))
    await a.reload()
    expect(nets(a.ledger('Flat'))[ben] ?? 0).toBe(0)
    expect(nets(b.ledger('Flat'))[ME] ?? 0).toBe(0)
    expect(sum(nets(a.ledger('Flat')))).toBe(0)
  })
})

describe('one person on two devices', () => {
  it('edits to the same bill from a phone and a laptop end up the same everywhere', async () => {
    const phone = await Client.open(ann)
    const laptop = await Client.open(ann)
    const g = randomUUID()
    const bl = bill('Lunch', ME, [ME], 2000)
    await phone.do((s) => A.createGroup(s, group(g, 'Solo', [ME])))
    await phone.do((s) => A.addBill(s, g, bl))
    await laptop.reload()
    await Promise.all([
      phone.do((s) => A.replaceBill(s, { ...findBill(s, bl.id)!.bill, title: 'Lunch (phone)' })),
      laptop.do((s) => A.replaceBill(s, { ...findBill(s, bl.id)!.bill, title: 'Lunch (laptop)' })),
    ])
    await Promise.all([phone.reload(), laptop.reload()])
    expect(findBill(phone.s, bl.id)!.bill.title).toBe(findBill(laptop.s, bl.id)!.bill.title)
    expect(['Lunch (phone)', 'Lunch (laptop)']).toContain(findBill(phone.s, bl.id)!.bill.title)
  })
})

describe('what a signed-in person could try directly against the database', () => {
  const as = (uid: string, text: string, params: unknown[] = []) => t.as(uid, () => t.sql(text, params))

  it('does not hand out other people’s email addresses, even to someone in the same group, but still shows their name and tag', async () => {
    const { g } = await flat()
    await as(ann, 'select invite_user($1, $2)', [g, cat])
    // a member
    await expect(as(ben, 'select email from profiles where id = $1', [ann])).rejects.toThrow(/permission denied/)
    await expect(as(ben, 'select * from profiles where id = $1', [ann])).rejects.toThrow(/permission denied/)
    expect(await as(ben, 'select name, tag from profiles where id = $1', [ann])).toEqual([{ name: 'Ann Lee', tag: 'ann' }])
    // someone only invited cannot read the inviter's profile at all
    await expect(as(cat, 'select email from profiles where id = $1', [ann])).rejects.toThrow(/permission denied/)
    expect(await as(cat, 'select name from profiles where id = $1', [ann])).toEqual([])
    // your own email comes from your sign-in, and the app still loads you
    expect((await Client.open(ann)).s.profile).toEqual({ name: 'Ann Lee', tag: 'ann', email: 'ann@example.com' })
  })

  it('shows an outsider nothing of a group, its bills, its people or its alerts', async () => {
    const { a, g } = await flat()
    await a.do((s) => A.addBill(s, g, bill('Secret dinner', ME, [ME, ben], 5000)))
    for (const table of ['groups', 'members', 'bills', 'payments', 'comments', 'lists', 'notifs', 'prefs', 'notes']) {
      expect(await as(cat, `select count(*)::int as n from ${table}`), table).toEqual([{ n: 0 }])
    }
    expect(await as(cat, 'select count(*)::int as n from profiles where id <> $1', [cat])).toEqual([{ n: 0 }])
  })

  it('does not let a member write alerts to someone else, rewrite another profile, or tamper with other members', async () => {
    const { g } = await flat()
    await expect(as(ben, `insert into notifs (user_id, data) values ($1, '{"text":"spam"}')`, [ann])).rejects.toThrow()
    expect(await as(ben, `update profiles set name = 'Hacked' where id = $1 returning id`, [ann])).toEqual([])
    await expect(as(ben, `delete from members where group_id = $1 and person_id = $2`, [g, ann])).rejects.toThrow(/permission denied/)
    expect(await as(ben, `update members set role = 'admin' where group_id = $1 and person_id = $2 returning 1`, [g, ben])).toEqual([])
    expect(await as(ben, `update groups set owner_id = $2 where id = $1 returning 1`, [g, ben])).toEqual([])
    expect(await as(ben, `delete from groups where id = $1 returning 1`, [g])).toEqual([])
    expect(await t.sql(`select name from profiles where id = $1`, [ann])).toEqual([{ name: 'Ann Lee' }])
    expect(await t.sql(`select role from members where group_id = $1 and person_id = $2`, [g, ben])).toEqual([{ role: 'member' }])
    expect(await t.sql(`select owner_id from groups where id = $1`, [g])).toEqual([{ owner_id: ann }])
  })

  it('does not let one person read another’s bills through the public share link without the secret', async () => {
    const { a, g } = await flat()
    await a.do((s) => A.addBill(s, g, bill('Secret dinner', ME, [ME, ben], 5000)))
    expect(await t.anon(() => t.sql(`select public_bill('0000000000000000')`))).toEqual([{ public_bill: null }])
    expect(await t.anon(() => t.sql(`select count(*)::int as n from bills`).catch(() => [{ n: -1 }]))).toEqual([{ n: -1 }])
  })

  it('does not show a scrambled sign-up or feedback of one person to another', async () => {
    await as(ann, `select submit_feedback('up', 'ann private note', '', '/home', 'test')`)
    await expect(as(ben, 'select * from feedback')).rejects.toThrow()
    await expect(as(ben, 'select admin_users()')).rejects.toThrow()
  })
})

describe('two placeholders, one linked by tag, one matched after joining by the group link', () => {
  async function twoNames() {
    const a = await Client.open(ann)
    const sam = randomUUID()
    const dana = randomUUID()
    const g = randomUUID()
    await a.do((s) => ({ ...s, people: { ...s.people, [sam]: { id: sam, name: 'Sam', user: false }, [dana]: { id: dana, name: 'Dana', user: false } } }))
    await a.do((s) => A.createGroup(s, group(g, 'Flat', [ME, sam, dana])))
    await a.do((s) => A.addBill(s, g, bill('Pizza', ME, [ME, sam, dana], 9000)))
    await a.do((s) => A.addBill(s, g, bill('Taxi', ME, [ME, sam], 3000)))
    await a.do((s) => A.addBill(s, g, bill('Cinema', ME, [ME, dana], 4000)))
    await a.settle()
    return { a, g, sam, dana }
  }

  it('both end up as real people, keep their own bills, and the totals never change', async () => {
    const { a, g, sam, dana } = await twoNames()
    const before = nets(a.ledger('Flat'))
    expect(placeholderCount(a)).toBe(2)

    // Sam is linked to Ben by tag: Ben is invited and accepts
    await a.rpc('select link_contact($1, $2, $3)', [g, sam, ben])
    const b = await Client.open(ben)
    await b.rpc('select accept_invite($1)', [g])

    // Cat opens the group link, the admin approves, and then says this is Dana
    const code = a.ledger('Flat').inviteCode as string
    const c = await Client.open(cat)
    await c.rpc('select request_join($1)', [code])
    await a.reload()
    await a.rpc('select decide_join($1, $2, true)', [g, cat])
    expect(a.ledger('Flat').members).toContain(cat)
    expect(placeholderCount(a)).toBe(1) // only Dana is left as a name
    await a.rpc('select link_contact($1, $2, $3)', [g, dana, cat])

    const after = nets(a.ledger('Flat'))
    expect(after[ben]).toBe(before[sam])
    expect(after[cat]).toBe(before[dana])
    expect(after[sam]).toBeUndefined()
    expect(after[dana]).toBeUndefined()
    expect(sum(after)).toBe(0)
    expect(placeholderCount(a)).toBe(0)
    await Promise.all([b.reload(), c.reload()])
    expect(nets(b.ledger('Flat'))[ME]).toBe(before[sam])
    expect(nets(c.ledger('Flat'))[ME]).toBe(before[dana])
    expect(b.ledger('Flat').bills.map((x) => x.title).sort()).toEqual(['Cinema', 'Pizza', 'Taxi'])
  })

  it('a person who is both a joiner and in a shared bill with the placeholder cannot be merged by accident', async () => {
    const { a, g, sam } = await twoNames()
    // Ben joins by invite, then Ann splits a new bill with both Sam and Ben
    await a.edit((s) => A.rememberFriend(s, { id: ben, name: 'Ben Ray', tag: 'ben' }))
    await a.rpc('select invite_user($1, $2)', [g, ben])
    const b = await Client.open(ben)
    await b.rpc('select accept_invite($1)', [g])
    await a.reload()
    await a.do((s) => A.addBill(s, g, bill('Everyone', ME, [ME, sam, ben], 6000)))
    await expect(t.as(ann, () => t.sql('select link_contact($1, $2, $3)', [g, sam, ben]))).rejects.toThrow(/same bill or payment/)
    await a.reload()
    expect(a.ledger('Flat').members).toContain(sam) // nothing changed
  })

  it('someone linked and then declining stays on the balances, and can be invited again', async () => {
    const { a, g, sam } = await twoNames()
    await a.rpc('select link_contact($1, $2, $3)', [g, sam, ben])
    const b = await Client.open(ben)
    await b.rpc('select decline_invite($1)', [g])
    await a.reload()
    const l = a.ledger('Flat')
    expect(l.former).toContain(ben)
    expect(shownPeople(l)).toContain(ben) // still owed money, so still shown
    expect(splitPeople(l)).not.toContain(ben)
    await a.rpc('select invite_user($1, $2)', [g, ben])
    expect(a.ledger('Flat').invited).toContain(ben)
    expect(splitPeople(a.ledger('Flat'))).toContain(ben)
    await b.reload()
    await b.rpc('select accept_invite($1)', [g])
    expect(b.ledger('Flat').bills.map((x) => x.title)).toContain('Taxi')
  })
})

const placeholderCount = (c: Client) => placeholdersIn(c.s, c.ledger('Flat')).length

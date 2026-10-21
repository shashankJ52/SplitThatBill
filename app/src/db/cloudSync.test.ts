import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as A from '../data/actions.ts'
import { createCloudRepository } from '../data/cloud/cloudRepository.ts'
import { makeBill } from '../domain/bills.ts'
import type { AppBill, AppLedger, AppState } from '../domain/types.ts'
import { ME } from '../domain/types.ts'
import { uid } from '../domain/util.ts'
import { createTestDb, type TestDb } from './harness.ts'
import { pgliteDb } from './pgliteDb.ts'

let t: TestDb
let ann: string
let ben: string

/** One device: load the person's data, then save changes back, like the app does. */
async function device(userId: string) {
  const onRejected = vi.fn()
  const repo = createCloudRepository(pgliteDb(t, userId), onRejected)
  let state = await repo.load()
  return {
    get state() {
      return state
    },
    onRejected,
    edit: async (fn: (s: AppState) => AppState) => {
      state = fn(state)
      await repo.save(state)
    },
    /** Pull the latest, as the app does when you come back to it. */
    reload: async () => {
      state = await repo.load()
      return state
    },
  }
}
type Device = Awaited<ReturnType<typeof device>>

const withContact = (s: AppState, id: string, name: string): AppState => ({ ...s, people: { ...s.people, [id]: { id, name, user: false } } })
const newBill = (title: string, people: string[], by: string = ME, over: Partial<AppBill> = {}) =>
  makeBill({
    id: uid(), title, date: '2026-10-20', payer: by, by, rt: 3000, people,
    items: [{ id: 1, name: 'Dinner', qty: 1, price: 3000, a: { mode: 'even', even: people, por: {} } }],
    ...over,
  })
const ledgerOf = (d: Device, id: string) => d.state.ledgers.find((l) => l.id === id) as AppLedger

/** Ann makes a group (with a contact called Sam) and saves it. */
async function annHasGroup(a: Device) {
  const gid = uid()
  const sam = uid()
  await a.edit((s) => A.createGroup(withContact(s, sam, 'Sam'), { id: gid, name: 'Flat', color: '#0039A6', simplify: true, members: [ME, sam] }))
  return { gid, sam }
}
/** Ann invites Ben and he accepts. */
async function benJoins(gid: string) {
  await t.as(ann, () => t.sql('select invite_user($1, $2)', [gid, ben]))
  await t.as(ben, () => t.sql('select accept_invite($1)', [gid]))
}

beforeEach(async () => {
  t = await createTestDb()
  ann = await t.signUp('Ann Lee', 'ann')
  ben = await t.signUp('Ben Ray', 'ben')
}, 60_000)

describe('one person, two devices', () => {
  it('a new account loads empty with its profile', async () => {
    const a = await device(ann)
    expect(a.state.ledgers).toEqual([])
    expect(a.state.profile).toMatchObject({ name: 'Ann Lee', tag: 'ann' })
    expect(a.state.people[ME]).toMatchObject({ name: 'You', tag: 'ann' })
  })

  it('a group, its contact, a bill, a payment, a list and a note all come back the same on another device', async () => {
    const a = await device(ann)
    const { gid, sam } = await annHasGroup(a)
    const bill = newBill('Pizza', [ME, sam], ME, { comments: [{ id: uid(), by: ME, text: 'Extra cheese', ts: 1_700_000_000_000 }] })
    const pay = { id: uid(), from: sam, to: ME, amt: 500, date: '2026-10-20', note: 'Cash' }
    const list = { id: uid(), title: 'Costco', memo: 'Bring bags', ts: Date.now(), items: [{ id: uid(), t: 'Eggs', done: true, doneBy: ME }, { id: uid(), t: 'Milk', done: false, doneBy: null }] }
    const note = { id: uid(), title: 'Gift ideas', memo: '', ts: Date.now(), items: [] }
    await a.edit((s) => ({ ...A.addBill(s, gid, bill), notes: [note] }))
    await a.edit((s) => A.addPayment(s, gid, pay))
    await a.edit((s) => A.saveNote(s, list, null, `g:${gid}`))
    await a.edit((s) => ({ ...s, noteOrder: ['n:' + note.id], hidden: ['x'] }))

    const b = await device(ann) // a second device
    const l = ledgerOf(b, gid)
    expect(l).toMatchObject({ kind: 'group', name: 'Flat', color: '#0039A6', simplify: true, members: [ME, sam], owner: ME, roles: { [ME]: 'owner' } })
    // the database adds when each was recorded; everything else comes back exactly as saved
    const noTime = <T extends { ts?: number }>(x: T[]) => x.map(({ ts, ...rest }) => (expect(typeof ts).toBe('number'), rest))
    expect(noTime(l.bills)).toEqual([bill])
    expect(noTime(l.payments)).toEqual([{ ...pay, by: ME }])
    expect(l.lists).toMatchObject([{ id: list.id, title: 'Costco', memo: 'Bring bags', items: list.items }])
    expect(b.state.people[sam]).toMatchObject({ name: 'Sam', user: false })
    expect(b.state.notes).toEqual([note])
    expect(b.state.noteOrder).toEqual(['n:' + note.id])
    expect(b.state.hidden).toEqual(['x'])
  })

  it('how you arranged the Groups tab follows you to another device', async () => {
    const a = await device(ann)
    const g1 = (await annHasGroup(a)).gid
    const g2 = uid()
    await a.edit((s) => A.createGroup(s, { id: g2, name: 'Second', color: '#00933C', simplify: true, members: [ME] }))
    await a.edit((s) => A.dismissPerson(A.setPeopleOrder(A.setGroupOrder(s, [g2, g1]), ['x', 'y']), 'x', '2026-10-21'))
    const b = await device(ann)
    expect(b.state.layout).toEqual({ groups: [g2, g1], people: ['x', 'y'], dismissed: { x: '2026-10-21' } })
    await b.edit((s) => A.undismissPerson(s, 'x'))
    expect((await a.reload()).layout?.dismissed).toEqual({})
  })

  it('edits and deletions on one device reach the other', async () => {
    const a = await device(ann)
    const { gid, sam } = await annHasGroup(a)
    const bill = newBill('Pizza', [ME, sam])
    await a.edit((s) => A.addBill(s, gid, bill))
    const b = await device(ann)
    await b.edit((s) => A.replaceBill(s, { ...ledgerOf(b, gid).bills[0], title: 'Pizza night', notes: 'with garlic bread' }))
    expect(ledgerOf(await a.reload() && a, gid).bills[0]).toMatchObject({ title: 'Pizza night', notes: 'with garlic bread' })
    await a.edit((s) => A.deleteBill(s, bill.id))
    expect(ledgerOf(await b.reload() && b, gid).bills).toEqual([])
    await a.edit((s) => A.deleteGroup(s, gid))
    expect((await b.reload()).ledgers).toEqual([])
  })

  it('taking a contact out of a group keeps their name for history', async () => {
    const a = await device(ann)
    const { gid, sam } = await annHasGroup(a)
    const bill = newBill('Pizza', [ME, sam])
    await a.edit((s) => A.addBill(s, gid, bill))
    await a.edit((s) => A.updateGroup(s, gid, { members: [ME] }))
    const b = await device(ann)
    const l = ledgerOf(b, gid)
    expect(l.members).toEqual([ME])
    expect(l.former).toEqual([sam])
    expect(b.state.people[sam].name).toBe('Sam')
    expect(l.bills[0].shares[sam]).toBe(1500)
  })

  it('a save that fails on the network is retried and does not duplicate anything', async () => {
    const a = await device(ann)
    const gid = uid()
    const repoDb = pgliteDb(t, ann)
    let down = true
    const flaky = { ...repoDb, insert: async (...x: Parameters<typeof repoDb.insert>) => { if (down) throw new Error('Failed to fetch'); return repoDb.insert(...x) } }
    const repo = createCloudRepository(flaky)
    const s = await repo.load()
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const next = A.createGroup(s, { id: gid, name: 'Later', color: '#0039A6', simplify: true, members: [ME] })
    await repo.save(next)
    expect(repo.pending()).toBe(true)
    down = false
    await repo.save(next)
    expect(repo.pending()).toBe(false)
    err.mockRestore()
    expect((await a.reload()).ledgers.map((l) => l.id)).toEqual([gid])
  })
})

describe('two people in one group', () => {
  let a: Device
  let gid: string
  let sam: string
  beforeEach(async () => {
    a = await device(ann)
    ;({ gid, sam } = await annHasGroup(a))
    // Ann's bill already names Ben, whose account id she found by his tag
    const bill = newBill('Dinner', [ME, ben], ME)
    await a.edit((s) => A.addBill(s, gid, bill))
    await benJoins(gid)
  })

  it("Ben sees Ann's group with himself as you, Ann by name, and the right roles", async () => {
    const b = await device(ben)
    const l = ledgerOf(b, gid)
    expect(l.roles).toEqual({ [ME]: 'member', [ann]: 'owner', [sam]: 'member' }) // the contact Sam is a member too
    expect(l.owner).toBe(ann)
    expect(b.state.people[ann]).toMatchObject({ name: 'Ann Lee', tag: 'ann', user: true })
    expect(l.members).toEqual([ME, ann, sam].filter((p) => l.members.includes(p)))
    expect(l.members[0]).toBe(ME)
    const bill = l.bills[0]
    expect(bill.by).toBe(ann)
    expect(bill.payer).toBe(ann)
    expect(bill.shares).toEqual({ [ann]: 1500, [ME]: 1500 }) // Ben is "you" in his own view
    expect(JSON.stringify(b.state)).not.toContain(ben) // his own account id never appears in his state
  })

  it('what each adds shows up for the other, with ids swapped the right way round', async () => {
    const b = await device(ben)
    const benBill = newBill('Coffee', [ME, ann], ME)
    await b.edit((s) => A.addBill(s, gid, benBill))
    await b.edit((s) => A.addComment(s, ledgerOf(b, gid).bills[0].id, { id: uid(), by: ME, text: 'I had the pasta', ts: 1_700_000_000_000 }))
    const ra = await a.reload()
    const l = ra.ledgers[0]
    const coffee = l.bills.find((x) => x.title === 'Coffee') as AppBill
    expect(coffee.by).toBe(ben)
    expect(coffee.shares).toEqual({ [ben]: 1500, [ME]: 1500 }) // Ann is "you" in her view
    expect(l.bills.find((x) => x.title === 'Dinner')?.comments).toMatchObject([{ by: ben, text: 'I had the pasta' }])
    expect(ra.people[ben]).toMatchObject({ name: 'Ben Ray', tag: 'ben' })
    expect(ra.notifs.map((n) => n.text)).toEqual(expect.arrayContaining(['Ben Ray added Coffee to Flat', 'Ben Ray commented on Dinner']))
  })

  it("Ben's edits to Ann's bill, to the group, or to who owns what are never sent", async () => {
    const b = await device(ben)
    await b.edit((s) => ({
      ...s,
      ledgers: s.ledgers.map((l) => ({ ...l, name: 'Hacked', bills: l.bills.map((x) => ({ ...x, title: 'Hacked' })) })),
    }))
    expect(b.onRejected).not.toHaveBeenCalled()
    const ra = await a.reload()
    expect(ra.ledgers[0].name).toBe('Flat')
    expect(ra.ledgers[0].bills[0].title).toBe('Dinner')
  })

  it('both people tick different checklist items without overwriting each other', async () => {
    const list = { id: uid(), title: 'Costco', memo: '', ts: Date.now(), items: [{ id: uid(), t: 'Eggs', done: false, doneBy: null }, { id: uid(), t: 'Milk', done: false, doneBy: null }] }
    await a.edit((s) => A.saveNote(s, list, null, `g:${gid}`))
    const b = await device(ben)
    // both start from the same list, then each ticks a different item
    await a.edit((s) => A.toggleNoteItem(s, { ctx: 'g', gid }, list.id, list.items[0].id, ME))
    await b.edit((s) => A.toggleNoteItem(s, { ctx: 'g', gid }, list.id, list.items[1].id, ME))
    const items = (await a.reload()).ledgers[0].lists[0].items
    expect(items.map((i) => [i.t, i.done, i.doneBy])).toEqual([['Eggs', true, ME], ['Milk', true, ben]])
  })

  it("alerts: reading and dismissing one is saved, and it cannot be done to someone else's", async () => {
    const b = await device(ben)
    const mine = b.state.notifs
    expect(mine.length).toBeGreaterThan(0)
    await b.edit((s) => A.markAllRead(s))
    expect((await b.reload()).notifs.every((n) => n.read)).toBe(true)
    await b.edit((s) => A.dismissAll(s).state)
    expect((await b.reload()).notifs).toEqual([])
    expect((await a.reload()).notifs.length).toBeGreaterThan(0) // Ann's are untouched
  })

  it('a removed member loses the group, and the others keep their history', async () => {
    await t.as(ann, () => t.sql('select remove_member($1, $2)', [gid, ben]))
    const b = await device(ben)
    expect(b.state.ledgers).toEqual([])
    const ra = await a.reload()
    expect(ra.ledgers[0].former).toEqual([ben])
    expect(ra.ledgers[0].bills).toHaveLength(1)
    expect(ra.people[ben].name).toBe('Ben Ray')
  })
})

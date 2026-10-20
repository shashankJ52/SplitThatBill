import { describe, expect, it } from 'vitest'
import { calc, nets, pairNet } from '../money'
import { seedState } from '../domain/seed'
import { allNoteEntries, findBill, ledgerById, noteKey, oneLedger, pairBalance } from '../domain/selectors'
import { ME } from '../domain/types'
import * as A from './actions'

const NOW = 1_800_000_000_000
const fresh = () => seedState(NOW)

describe('addPersonFromInput', () => {
  it('rejects empty and malformed input', () => {
    const s = fresh()
    expect(A.addPersonFromInput(s, '  ', [], 'x').err).toBe('Enter a name or @usertag')
    expect(A.addPersonFromInput(s, '@a', [], 'x').err).toMatch(/3–20/)
    expect(A.addPersonFromInput(s, '@nobody', [], 'x').err).toMatch(/No user @nobody/)
  })
  it('finds people by usertag or name, ignoring case', () => {
    const s = fresh()
    expect(A.addPersonFromInput(s, '@JAMES', [], 'x').id).toBe('james')
    expect(A.addPersonFromInput(s, 'priya', [], 'x').id).toBe('priya')
  })
  it('creates a local contact for a new name and refuses duplicates', () => {
    const s = fresh()
    const r = A.addPersonFromInput(s, 'Marie', [], 'p1')
    expect(r.id).toBe('p1')
    expect(r.state.people.p1).toEqual({ id: 'p1', name: 'Marie', user: false })
    expect(A.addPersonFromInput(r.state, 'marie', ['p1'], 'p2').err).toBe('Marie is already here')
  })
  it('does not change the state when it fails', () => {
    const s = fresh()
    expect(A.addPersonFromInput(s, '@nobody', [], 'x').state).toBe(s)
  })
})

describe('groups', () => {
  it('creates, updates and deletes a group, removing its alerts and note settings', () => {
    let s = A.createGroup(fresh(), { id: 'gx', name: 'Ski trip', color: '#FF6319', simplify: true, members: [ME, 'james'] })
    expect(ledgerById(s, 'gx')?.name).toBe('Ski trip')
    s = A.updateGroup(s, 'gx', { name: 'Ski weekend', simplify: false })
    expect(ledgerById(s, 'gx')).toMatchObject({ name: 'Ski weekend', simplify: false })
    s = A.deleteGroup(s, 'g1')
    expect(ledgerById(s, 'g1')).toBeUndefined()
    expect(s.notifs.some((n) => n.gid === 'g1' || n.billId === 'b1')).toBe(false)
    expect(s.notifs.some((n) => n.billId === 'b3')).toBe(true)
  })
  it('only lets a settled member be removed', () => {
    const s = fresh()
    expect(A.canRemoveMember(ledgerById(s, 'g1')!, 'james')).toBe(false)
    expect(A.canRemoveMember(ledgerById(s, 'g1')!, 'nobody')).toBe(true)
  })
  it('opens a 1-1 ledger once', () => {
    const s = fresh()
    const a = A.ensureOneLedger(s, 'priya', 'o9')
    expect(a.id).toBe('o9')
    expect(A.ensureOneLedger(a.state, 'priya', 'o10').id).toBe('o9')
    expect(A.ensureOneLedger(s, 'james', 'zz').id).toBe('o1')
  })
})

describe('bills and comments', () => {
  it('deletes a bill and its alerts, and balances follow', () => {
    const s = fresh()
    const before = nets(ledgerById(s, 'g1')!)
    const next = A.deleteBill(s, 'b1')
    expect(findBill(next, 'b1')).toBeNull()
    expect(next.notifs.some((n) => n.billId === 'b1')).toBe(false)
    expect(nets(ledgerById(next, 'g1')!)).not.toEqual(before)
  })
  it('adds and removes comments', () => {
    let s = A.addComment(fresh(), 'b2', { id: 'cz', by: ME, text: 'hi', ts: NOW })
    expect(findBill(s, 'b2')!.bill.comments).toHaveLength(1)
    s = A.deleteComment(s, 'b2', 'cz')
    expect(findBill(s, 'b2')!.bill.comments).toHaveLength(0)
  })
  it('replaces a bill in place', () => {
    const s = fresh()
    const b = { ...findBill(s, 'b2')!.bill, title: 'Wifi' }
    expect(findBill(A.replaceBill(s, b), 'b2')!.bill.title).toBe('Wifi')
  })
})

describe('payments', () => {
  it('clears a person balance across the 1-1 ledger and groups with one payment', () => {
    const s = fresh()
    const owed = pairBalance(s, 'james').tot
    expect(owed).toBeGreaterThan(0)
    const r = A.applyPersonPayment(s, { id: 'pay', newLedgerId: 'oN', pid: 'james', direction: 'in', amt: owed, date: '2026-10-19', note: 'Zelle' })
    expect(pairBalance(r.state, 'james').tot).toBe(0)
    expect(r.steps[0].ledgerId).toBe('o1')
    expect(r.steps.reduce((a, x) => a + x.amt, 0)).toBe(owed)
    const linked = r.state.ledgers.flatMap((l) => l.payments).filter((p) => p.linkId === 'pay')
    expect(linked.length).toBe(r.steps.length)
    expect(linked.every((p) => p.note === 'Zelle')).toBe(true)
  })
  it('credits an overpayment to the 1-1 ledger', () => {
    const s = fresh()
    const owed = pairBalance(s, 'james').tot
    const r = A.applyPersonPayment(s, { id: 'pay', newLedgerId: 'oN', pid: 'james', direction: 'in', amt: owed + 500, date: '2026-10-19' })
    expect(pairBalance(r.state, 'james').tot).toBe(-500)
  })
  it('applies a payment to the group where you owe, without opening a 1-1 ledger', () => {
    const s = fresh()
    const r = A.applyPersonPayment(s, { id: 'pay', newLedgerId: 'oNew', pid: 'priya', direction: 'out', amt: 1000, date: '2026-10-19' })
    expect(oneLedger(r.state, 'priya')).toBeUndefined()
    expect(r.steps).toEqual([{ ledgerId: 'g1', amt: 1000 }])
    expect(pairNet(r.state.ledgers, ME, 'priya').tot).toBe(pairBalance(s, 'priya').tot + 1000)
  })
  it('opens a 1-1 ledger for the part of a payment that is more than you owe', () => {
    const s = fresh()
    const owe = -pairBalance(s, 'priya').tot
    const r = A.applyPersonPayment(s, { id: 'pay', newLedgerId: 'oNew', pid: 'priya', direction: 'out', amt: owe + 366, date: '2026-10-19' })
    expect(oneLedger(r.state, 'priya')?.id).toBe('oNew')
    expect(pairBalance(r.state, 'priya').tot).toBe(366)
  })
})

describe('notes and lists', () => {
  const note = { id: 'm9', title: 'New', memo: '', items: [], ts: NOW }
  it('saves a new note to Just me or to a group', () => {
    expect(A.saveNote(fresh(), note, null, 'n').notes.at(-1)?.id).toBe('m9')
    expect(ledgerById(A.saveNote(fresh(), note, null, 'g:g2'), 'g2')!.lists.at(-1)?.id).toBe('m9')
  })
  it('moves a personal note into a group and clears its order and hidden flags', () => {
    let s = A.moveNoteToTop(fresh(), 'n:m1')
    s = A.toggleNoteHidden(s, 'n:m1')
    const m1 = s.notes.find((n) => n.id === 'm1')!
    s = A.saveNote(s, m1, { ctx: 'n', gid: null }, 'g:g1')
    expect(s.notes.some((n) => n.id === 'm1')).toBe(false)
    expect(ledgerById(s, 'g1')!.lists.some((n) => n.id === 'm1')).toBe(true)
    expect(s.noteOrder).not.toContain('n:m1')
  })
  it('edits in place when the destination does not change', () => {
    const s = fresh()
    const edited = { ...s.notes[1], title: 'Edited' }
    const next = A.saveNote(s, edited, { ctx: 'n', gid: null }, 'n')
    expect(next.notes.map((n) => n.id)).toEqual(s.notes.map((n) => n.id))
    expect(next.notes[1].title).toBe('Edited')
  })
  it('ticks items and records who got it in groups', () => {
    const s = A.toggleNoteItem(fresh(), { ctx: 'g', gid: 'g1' }, 'gl1', '1', ME)
    const item = ledgerById(s, 'g1')!.lists[0].items[0]
    expect(item).toMatchObject({ done: true, doneBy: ME })
    expect(ledgerById(A.toggleNoteItem(s, { ctx: 'g', gid: 'g1' }, 'gl1', '1', ME), 'g1')!.lists[0].items[0]).toMatchObject({ done: false, doneBy: null })
  })
  it('keeps the order of notes that were off screen when saving a dragged order', () => {
    let s = A.setNoteOrder(fresh(), ['n:m3', 'n:m1', 'n:m2'])
    s = A.setNoteOrder(s, ['n:m2', 'n:m3'])
    expect(s.noteOrder).toEqual(['n:m2', 'n:m3', 'n:m1'])
  })
  it('hides and unhides a note', () => {
    let s = A.toggleNoteHidden(fresh(), 'n:m1')
    expect(s.hidden).toEqual(['n:m1'])
    s = A.toggleNoteHidden(s, 'n:m1')
    expect(s.hidden).toEqual([])
  })
  it('deletes a note', () => {
    const s = A.deleteNote(fresh(), { ctx: 'n', gid: null }, 'm2')
    expect(s.notes.some((n) => n.id === 'm2')).toBe(false)
  })
  it('shows group lists with open items beside personal notes', () => {
    const e = allNoteEntries(fresh())
    expect(e.filter((x) => x.ctx === 'g').map(noteKey)).toEqual(['g:g1:gl1', 'g:g1:gl2', 'g:g2:gl3'])
  })
})

describe('alerts', () => {
  it('toggles read and marks all read', () => {
    let s = A.toggleRead(fresh(), 'n3')
    expect(s.notifs.find((n) => n.id === 'n3')!.read).toBe(false)
    s = A.markAllRead(s)
    expect(s.notifs.every((n) => n.read)).toBe(true)
  })
  it('dismisses and restores one alert in its place', () => {
    const s = fresh()
    const d = A.dismissNotif(s, 'n2')
    expect(d.state.notifs.map((n) => n.id)).toEqual(['n1', 'n3'])
    expect(A.restoreNotif(d.state, d.removed!, d.index).notifs.map((n) => n.id)).toEqual(['n1', 'n2', 'n3'])
    expect(A.dismissNotif(s, 'nope').state).toBe(s)
  })
  it('dismisses and restores everything', () => {
    const d = A.dismissAll(fresh())
    expect(d.state.notifs).toEqual([])
    expect(A.restoreAll(d.state, d.removed).notifs).toHaveLength(3)
  })
  it('records a reminder you sent', () => {
    const s = A.sendReminder(fresh(), { id: 's1', to: 'james', gid: 'g2', amt: 100, text: 'hi', ts: NOW })
    expect(s.sent).toHaveLength(1)
  })
  it('creates a friend reminder only when you owe a friend on the app', () => {
    const r = A.demoFriendReminder(fresh(), 'nr', NOW)
    expect(r.from).toBe('priya')
    expect(r.state.notifs.at(-1)).toMatchObject({ kind: 'remind', from: 'priya', read: false })
    expect(r.state.notifs.at(-1)!.msg).toContain('@shashank')
  })
  it('adds a friend bill and an alert for it', () => {
    const r = A.demoFriendAddsBill(fresh(), { bill: 'bd', notif: 'nd' }, '2026-10-19', NOW)
    expect(r.ok).toBe(true)
    expect(findBill(r.state, 'bd')!.bill.payer).toBe('james')
    expect(r.state.notifs.at(-1)!.billId).toBe('bd')
  })
})

describe('profile', () => {
  it('keeps your usertag in sync on your person', () => {
    const s = A.setProfile(fresh(), { tag: 'newtag', name: 'Alex' })
    expect(s.profile).toMatchObject({ tag: 'newtag', name: 'Alex' })
    expect(s.people[ME].tag).toBe('newtag')
  })
})

describe('sample data integrity', () => {
  it('every bill is complete and its shares add up to its total', () => {
    for (const l of fresh().ledgers) {
      for (const b of l.bills) {
        expect(calc(b).complete).toBe(true)
        expect(Object.values(b.shares).reduce((a, x) => a + x, 0)).toBe(b.total)
      }
    }
  })
})

describe('account actions', () => {
  it('sign out keeps the data; sign in restores access', async () => {
    const A = await import('./actions')
    const { seedState } = await import('../domain/seed')
    const s = seedState(Date.UTC(2026, 9, 19, 12))
    const out = A.signOut(s)
    expect(out.signedIn).toBe(false)
    expect(out.ledgers).toBe(s.ledgers)
    expect(A.signIn(out).signedIn).toBe(true)
  })
  it('clear all data keeps only the account; reload sample brings the story back', async () => {
    const A = await import('./actions')
    const { seedState } = await import('../domain/seed')
    const s = seedState(Date.UTC(2026, 9, 19, 12))
    const c = A.clearAllData(s)
    expect(c.ledgers).toEqual([])
    expect(c.notifs).toEqual([])
    expect(Object.keys(c.people)).toEqual(['me'])
    expect(c.profile).toEqual(s.profile)
    const r = A.reloadSample(c, Date.UTC(2026, 9, 19, 12))
    expect(r.ledgers.length).toBe(s.ledgers.length)
    expect(r.profile).toEqual(s.profile)
  })
  it('a new account starts empty and signed in', async () => {
    const A = await import('./actions')
    const a = A.createAccount({ name: 'Alex', email: 'a@b.co', tag: 'alex' }, 'pw123456')
    expect(a.signedIn).toBe(true)
    expect(a.ledgers).toEqual([])
    expect(a.people.me.tag).toBe('alex')
  })
})

describe('ids', () => {
  it('older saved checklists with numeric item ids are upgraded to strings', async () => {
    const { withStringItemIds } = await import('./persist')
    const { seedState } = await import('../domain/seed')
    const s = seedState(Date.UTC(2026, 9, 19, 12))
    const old = { ...s, notes: s.notes.map((n) => ({ ...n, items: n.items.map((x, i) => ({ ...x, id: i + 1 as unknown as string })) })) }
    const fixed = withStringItemIds(old)
    expect(fixed.notes[0].items.every((x) => typeof x.id === 'string')).toBe(true)
    expect(fixed.notes[0].items[0].id).toBe('1')
  })
  it('new ids are real UUIDs, derived ids are stable, and share tokens are long', async () => {
    const { uid, derivedId, isUuid, token } = await import('../domain/util')
    expect(isUuid(uid('x'))).toBe(true)
    expect(uid()).not.toBe(uid())
    const base = uid()
    expect(derivedId(base, 3)).toBe(derivedId(base, 3))
    expect(derivedId(base, 3)).not.toBe(derivedId(base, 4))
    expect(isUuid(derivedId(base, 3))).toBe(true)
    expect(derivedId('pay', 2)).toBe('pay_2')
    expect(token()).toHaveLength(20)
  })
})

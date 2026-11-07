import { describe, expect, it } from 'vitest'
import { makeBill } from './bills'
import { emptyState } from './seed'
import type { AppLedger, AppState } from './types'
import { ME } from './types'
import { shownPeople } from './selectors'
import { balanceWith, deletionPlan, handoverCandidates, isAdmin, isOwner, linkTargets, memberActions, memberLines, myRole, pendingInvites, reminderRoute, removalCheck, writeOffPayments } from './membership'
import { balanceOf } from './membership'
import { nets } from '../money'

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const SAM = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const profile = { name: 'Me Myself', email: 'm@x.co', tag: 'me' }

const bill = (payer: string, people: string[], total = 3000) =>
  makeBill({ id: crypto.randomUUID(), title: 'Dinner', date: '2026-10-20', payer, by: payer, rt: total, people, items: [{ id: 1, name: 'x', qty: 1, price: total, a: { mode: 'even', even: people, por: {} } }] })

function setup(over: Partial<AppLedger> = {}): { s: AppState; l: AppLedger } {
  const l: AppLedger = { id: 'g', kind: 'group', name: 'Flat', simplify: true, members: [ME, A, SAM], bills: [bill(ME, [ME, A, SAM])], payments: [], lists: [], roles: { [ME]: 'owner', [A]: 'member', [SAM]: 'member' }, ...over }
  const s: AppState = { ...emptyState(profile, ''), ledgers: [l], people: { [ME]: { id: ME, name: 'You', user: true, tag: 'me' }, [A]: { id: A, name: 'Ann', user: true, tag: 'ann' }, [SAM]: { id: SAM, name: 'Sam', user: false } } }
  return { s, l }
}

describe('roles', () => {
  it('a group that was never shared is yours to run', () => {
    const l = setup({ roles: undefined }).l
    expect(myRole(l)).toBe('owner')
    expect(isOwner(l) && isAdmin(l)).toBe(true)
  })
  it('reads your role from the group', () => {
    expect(isAdmin(setup({ roles: { [ME]: 'admin' } }).l)).toBe(true)
    expect(isAdmin(setup({ roles: { [ME]: 'member' } }).l)).toBe(false)
    expect(isOwner(setup({ roles: { [ME]: 'admin' } }).l)).toBe(false)
  })
})

describe('settle first', () => {
  it('blocks removal while there is a balance, allows it at zero', () => {
    const { l } = setup()
    expect(removalCheck(l, A)).toEqual({ ok: false, net: -1000 })
    const settled = { ...l, payments: [{ id: 'p', from: A, to: ME, amt: 1000, date: '2026-10-20' }, { id: 'q', from: SAM, to: ME, amt: 1000, date: '2026-10-20' }] }
    expect(removalCheck(settled, A)).toEqual({ ok: true })
    expect(balanceOf(settled, ME)).toBe(0)
  })
  it('writing off clears the person and records visible adjustments', () => {
    const { l } = setup()
    let n = 0
    const pays = writeOffPayments(l, A, () => `w${++n}`, '2026-10-21', 'Written off when Ann was removed')
    expect(pays.length).toBeGreaterThan(0)
    expect(pays.every((p) => p.note?.startsWith('Written off') && (p.from === A || p.to === A))).toBe(true)
    const after = { ...l, payments: [...l.payments, ...pays] }
    expect(nets(after)[A] ?? 0).toBe(0)
    expect(removalCheck(after, A)).toEqual({ ok: true })
  })
  it('write-off also works when the person is owed money, and with simplify off', () => {
    const { l } = setup({ simplify: false, bills: [bill(A, [ME, A, SAM])] })
    const pays = writeOffPayments(l, A, () => crypto.randomUUID(), '2026-10-21', 'n')
    expect(nets({ ...l, payments: pays })[A] ?? 0).toBe(0)
  })
  it('writes nothing off when the person is already settled', () => {
    const { l } = setup({ bills: [] })
    expect(writeOffPayments(l, A, () => 'x', '2026-10-21', 'n')).toEqual([])
  })
})

describe('inviting people added on this device', () => {
  it('lists real people who are in the group locally but unknown to the server', () => {
    const { s } = setup({ roles: undefined })
    expect(pendingInvites(s)).toEqual([{ gid: 'g', pid: A }]) // Sam is a contact, you are you
  })
  it('skips people already in, invited, or gone, and groups you do not run', () => {
    const base = setup()
    expect(pendingInvites(base.s)).toEqual([])
    expect(pendingInvites(setup({ roles: { [ME]: 'owner' }, invited: [A] }).s)).toEqual([])
    expect(pendingInvites(setup({ roles: { [ME]: 'owner' }, former: [A] }).s)).toEqual([])
    expect(pendingInvites(setup({ roles: { [ME]: 'member', [A]: 'owner' }, members: [ME, A, B] }).s)).toEqual([])
  })
})

describe('what you may do to a member', () => {
  const lines = (l: AppLedger, s: AppState) => Object.fromEntries(memberLines(s, l).map((m) => [m.pid, m]))
  it('the owner can promote, remove and hand over to an account holder, but not to a contact', () => {
    const { s, l } = setup()
    const m = lines(l, s)
    expect(memberActions(l, m[A])).toEqual({ promote: true, demote: false, remove: true, transfer: true })
    expect(memberActions(l, m[SAM])).toEqual({ promote: false, demote: false, remove: true, transfer: false })
    expect(memberActions(l, m[ME])).toEqual({ promote: false, demote: false, remove: false, transfer: false })
  })
  it('an admin removes members but not other admins or the owner and cannot change roles', () => {
    const { s, l } = setup({ roles: { [ME]: 'admin', [A]: 'owner', [B]: 'admin', [SAM]: 'member' }, members: [ME, A, B, SAM] })
    const s2 = { ...s, people: { ...s.people, [B]: { id: B, name: 'Bo', user: true } } }
    const m = lines(l, s2)
    expect(memberActions(l, m[SAM])).toMatchObject({ remove: true, promote: false, demote: false })
    expect(memberActions(l, m[B])).toMatchObject({ remove: false })
    expect(memberActions(l, m[A])).toMatchObject({ remove: false })
  })
  it('a plain member can do nothing to others', () => {
    const { s, l } = setup({ roles: { [ME]: 'member', [A]: 'owner', [SAM]: 'member' } })
    const m = lines(l, s)
    expect(memberActions(l, m[SAM])).toEqual({ promote: false, demote: false, remove: false, transfer: false })
  })
  it('an unshared group offers no member actions', () => {
    const { s, l } = setup({ roles: undefined })
    expect(memberActions(l, lines(l, s)[A])).toEqual({ promote: false, demote: false, remove: false, transfer: false })
  })
})

describe('where a reminder can be sent from', () => {
  const one = (over: Partial<AppLedger> = {}): AppLedger => ({ id: 'o', kind: 'one', with: A, simplify: false, members: [ME, A], bills: [bill(ME, [ME, A], 2000)], payments: [], lists: [], roles: { [ME]: 'owner', [A]: 'member' }, ...over })
  const stateOf = (...ledgers: AppLedger[]): AppState => ({ ...emptyState(profile, ''), ledgers, people: { [ME]: { id: ME, name: 'You', user: true }, [A]: { id: A, name: 'Ann', user: true, tag: 'ann' } } })

  it('a 1-1 split carries a reminder, even with no group at all', () => {
    const r = reminderRoute(stateOf(one()), A)
    expect(r.via?.id).toBe('o')
    expect(r.waiting).toBe(false)
  })
  it('picks the ledger where you share the most when there are several', () => {
    const group = setup({ members: [ME, A], bills: [bill(ME, [ME, A], 20000)], roles: { [ME]: 'owner', [A]: 'member' } }).l
    expect(reminderRoute(stateOf(one(), group), A).via?.id).toBe('g')
    expect(balanceWith(group, A)).toBe(10000)
    expect(balanceWith(one(), A)).toBe(1000)
  })
  it('says they are waiting when the friend was invited but has not accepted', () => {
    const pending = one({ members: [ME], roles: { [ME]: 'owner' }, invited: [A] })
    expect(reminderRoute(stateOf(pending), A)).toEqual({ via: null, waiting: true })
  })
  it('has no route for someone you do not share a split with', () => {
    expect(reminderRoute(stateOf(), A)).toEqual({ via: null, waiting: false })
  })
  it('for a single group, only that group counts', () => {
    const l = one()
    const group = setup({ members: [ME, A], bills: [bill(ME, [ME, A], 20000)], roles: { [ME]: 'owner', [A]: 'member' } }).l
    expect(reminderRoute(stateOf(l, group), A, l).via?.id).toBe('o') // the bigger group is ignored
    expect(reminderRoute(stateOf(l), A, group).via?.id).toBe('g')
  })
})

describe('deleting your account', () => {
  it('a group you run with another person who has an account needs a new owner', () => {
    const { s, l } = setup()
    const plan = deletionPlan(s)
    expect(plan.handover.map((h) => [h.ledger.id, h.candidates])).toEqual([['g', [A]]])
    expect(plan.removed).toEqual([])
    expect(plan.leaving).toEqual([])
    // you paid 3000 for three people, so you are owed 2000 and it is written off if the group carries on
    expect(plan.balances.map((b) => [b.ledger.id, b.net])).toEqual([[l.id, 2000]])
  })

  it('offers only active people with an account, admins first', () => {
    const B2 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
    const { s, l } = setup({ members: [ME, A, SAM, B2], roles: { [ME]: 'owner', [A]: 'member', [SAM]: 'member', [B2]: 'admin' }, invited: [] })
    const withB2 = { ...s, people: { ...s.people, [B2]: { id: B2, name: 'Bea', user: true, tag: 'bea' } } }
    expect(handoverCandidates(withB2, l)).toEqual([B2, A])
    // someone still only invited, or gone, cannot take over
    const l2 = { ...l, roles: { [ME]: 'owner' as const, [B2]: 'admin' as const }, invited: [A] }
    expect(handoverCandidates(withB2, l2)).toEqual([B2])
  })

  it('a group with only you and contacts goes away with the account, with no questions', () => {
    const { s } = setup({ members: [ME, SAM], roles: { [ME]: 'owner', [SAM]: 'member' }, bills: [] })
    const plan = deletionPlan(s)
    expect(plan.handover).toEqual([])
    expect(plan.removed.map((l) => l.id)).toEqual(['g'])
  })

  it('a group that was never shared goes away too', () => {
    const { s } = setup({ roles: undefined })
    expect(deletionPlan(s).removed.map((l) => l.id)).toEqual(['g'])
  })

  it('a group someone else runs is one you leave, and an unsettled balance there is listed', () => {
    const { s } = setup({ roles: { [ME]: 'member', [A]: 'owner', [SAM]: 'member' }, bills: [bill(A, [ME, A, SAM])] })
    const plan = deletionPlan(s)
    expect(plan.leaving.map((l) => l.id)).toEqual(['g'])
    expect(plan.handover).toEqual([])
    expect(plan.balances.map((b) => b.net)).toEqual([-1000])
  })

  it('settled balances are not listed', () => {
    const { s } = setup({ bills: [] })
    expect(deletionPlan(s).balances).toEqual([])
  })

  it('a 1-1 split you started with a friend who has the app is handed to them', () => {
    const one: AppLedger = { id: 'o', kind: 'one', with: A, members: [ME, A], simplify: false, bills: [], payments: [], lists: [], roles: { [ME]: 'owner', [A]: 'member' } }
    const { s } = setup()
    const plan = deletionPlan({ ...s, ledgers: [one] })
    expect(plan.handover.map((h) => [h.ledger.id, h.candidates])).toEqual([['o', [A]]])
  })
})

describe('where a placeholder name can be linked to a real account', () => {
  it('lists the groups you run that the name is in', () => {
    const { s } = setup()
    expect(linkTargets(s, SAM)).toEqual(['g'])
  })
  it('skips groups you do not run, groups the name is not in and groups not saved to the server yet', () => {
    const { s } = setup({ roles: { [ME]: 'member', [A]: 'owner', [SAM]: 'member' } })
    expect(linkTargets(s, SAM)).toEqual([])
    expect(linkTargets(setup().s, A)).toEqual(['g']) // A is in it, so the list is by membership, not by account type
    expect(linkTargets(setup().s, 'nobody')).toEqual([])
    const unsaved = setup({ roles: undefined })
    expect(linkTargets(unsaved.s, SAM)).toEqual([])
  })
})

describe('people shown for a group', () => {
  it('are its members, and also anyone only invited who already has bills in it (a name just linked to an account)', () => {
    const linked = '99999999-9999-4999-8999-999999999999'
    const { l } = setup({ members: [ME, A], invited: [linked], bills: [bill(ME, [ME, A, linked])] })
    expect(shownPeople(l)).toEqual([ME, A, linked])
  })
  it('leave out someone invited who is in none of its bills yet, and never list anyone twice', () => {
    const fresh = '88888888-8888-4888-8888-888888888888'
    const { l } = setup({ members: [ME, A], invited: [fresh, A], bills: [bill(ME, [ME, A])] })
    expect(shownPeople(l)).toEqual([ME, A])
  })
})

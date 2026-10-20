import { describe, expect, it } from 'vitest'
import { makeBill } from './bills'
import { emptyState } from './seed'
import type { AppLedger, AppState } from './types'
import { ME } from './types'
import { isAdmin, isOwner, memberActions, memberLines, myRole, pendingInvites, removalCheck, writeOffPayments } from './membership'
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

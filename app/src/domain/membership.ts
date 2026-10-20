import { nets, transfers, type Cents, type PersonId } from '../money'
import type { AppLedger, AppPayment, AppState, Role } from './types'
import { ME } from './types'

/** Rules about who is in a group and what they may do. Pure functions, so they are easy to test. */

export const roleOf = (l: AppLedger, p: PersonId): Role | undefined => l.roles?.[p]
/** A group that has never been shared is yours alone, so you run it. */
export const myRole = (l: AppLedger): Role => l.roles?.[ME] ?? 'owner'
export const isOwner = (l: AppLedger) => myRole(l) === 'owner'
export const isAdmin = (l: AppLedger) => myRole(l) === 'owner' || myRole(l) === 'admin'
/** True once the group lives in the shared database (people can be invited to it). */
export const isShared = (l: AppLedger) => !!l.roles

/** What someone is owed (positive) or owes (negative) in one group. */
export const balanceOf = (l: AppLedger, p: PersonId): Cents => nets(l)[p] ?? 0

/** Settle first: a member can only be removed or leave once their balance is zero. */
export function removalCheck(l: AppLedger, p: PersonId): { ok: true } | { ok: false; net: Cents } {
  const net = balanceOf(l, p)
  return net === 0 ? { ok: true } : { ok: false, net }
}

/**
 * Payments that clear one person's balance, for "Remove and write off". Each payment is between that person and
 * someone they owe or are owed by, marked with a note so everyone can see the adjustment.
 */
export function writeOffPayments(l: AppLedger, p: PersonId, ids: () => string, date: string, note: string): AppPayment[] {
  return transfers({ ...l, id: l.id, kind: l.kind } as never)
    .filter((t) => t.from === p || t.to === p)
    .map((t) => ({ id: ids(), from: t.from, to: t.to, amt: t.amt, date, note, by: ME }))
}

/**
 * Real people who were added to a group on this device but are not yet invited on the server.
 * The app invites them once the group itself is saved. People already in, invited, or gone are left alone.
 */
export function pendingInvites(s: AppState): { gid: string; pid: PersonId }[] {
  const out: { gid: string; pid: PersonId }[] = []
  for (const l of s.ledgers) {
    if (!isAdmin(l)) continue
    for (const p of l.members) {
      if (p === ME || !s.people[p]?.user) continue
      if (l.roles?.[p] || l.invited?.includes(p) || l.former?.includes(p)) continue
      out.push({ gid: l.id, pid: p })
    }
  }
  return out
}

export interface MemberLine {
  pid: PersonId
  name: string
  tag?: string
  role: Role
  isYou: boolean
  /** a contact without the app */
  contact: boolean
  net: Cents
}

/** Who to list under People in group settings: you first, then the rest in the order they joined. */
export function memberLines(s: AppState, l: AppLedger): MemberLine[] {
  return l.members.map((p) => ({
    pid: p,
    name: p === ME ? s.profile.name || 'You' : s.people[p]?.name ?? 'Someone',
    tag: p === ME ? s.profile.tag : s.people[p]?.tag,
    role: roleOf(l, p) ?? (p === ME ? 'owner' : 'member'),
    isYou: p === ME,
    contact: p !== ME && !s.people[p]?.user,
    net: balanceOf(l, p),
  }))
}

/** What the signed-in person may do to another member. */
export function memberActions(l: AppLedger, target: MemberLine): { promote: boolean; demote: boolean; remove: boolean; transfer: boolean } {
  const owner = isOwner(l)
  const admin = isAdmin(l)
  const none = { promote: false, demote: false, remove: false, transfer: false }
  if (target.isYou || target.role === 'owner' || !isShared(l)) return none
  return {
    promote: owner && !target.contact && target.role === 'member',
    demote: owner && target.role === 'admin',
    remove: owner || (admin && target.role !== 'admin'),
    transfer: owner && !target.contact,
  }
}

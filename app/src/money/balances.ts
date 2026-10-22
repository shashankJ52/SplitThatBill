import { calc, computeShares, paidMap } from './calc'
import type { Cents, Ledger, PersonId, Transfer } from './types'

/** Direct pairwise debts in a ledger: bills settled per bill, then payments applied. */
export function debts(ledger: Pick<Ledger, 'bills' | 'payments'>): Transfer[] {
  const o: Record<string, Record<string, number>> = {}
  const add = (a: string, b: string, v: number) => {
    o[a] = o[a] ?? {}
    o[a][b] = (o[a][b] ?? 0) + v
  }
  for (const b of ledger.bills) {
    const shares = computeShares(b)
    const pm = paidMap(b, calc(b).total)
    const n: Record<string, number> = {}
    for (const p of Object.keys(shares)) n[p] = (n[p] ?? 0) - shares[p]
    for (const p of Object.keys(pm)) n[p] = (n[p] ?? 0) + pm[p]
    const d: { p: string; a: number }[] = []
    const c: { p: string; a: number }[] = []
    for (const p of Object.keys(n)) {
      if (n[p] < 0) d.push({ p, a: -n[p] })
      else if (n[p] > 0) c.push({ p, a: n[p] })
    }
    const desc = (x: { a: number }, y: { a: number }) => y.a - x.a
    d.sort(desc)
    c.sort(desc)
    let i = 0
    let j = 0
    while (i < d.length && j < c.length) {
      const m = Math.min(d[i].a, c[j].a)
      add(d[i].p, c[j].p, m)
      d[i].a -= m
      c[j].a -= m
      if (!d[i].a) i++
      if (!c[j].a) j++
    }
  }
  for (const x of ledger.payments) add(x.from, x.to, -x.amt)

  const out: Transfer[] = []
  const seen = new Set<string>()
  for (const a of Object.keys(o)) {
    for (const b of Object.keys(o[a])) {
      const k = [a, b].sort().join('|')
      if (seen.has(k)) continue
      seen.add(k)
      const d = (o[a][b] ?? 0) - (o[b]?.[a] ?? 0)
      if (d > 0) out.push({ from: a, to: b, amt: d })
      else if (d < 0) out.push({ from: b, to: a, amt: -d })
    }
  }
  return out
}

/** Net position per person: positive means they are owed money. */
export function nets(ledger: Pick<Ledger, 'bills' | 'payments'>): Record<PersonId, Cents> {
  const n: Record<PersonId, Cents> = {}
  for (const t of debts(ledger)) {
    n[t.from] = (n[t.from] ?? 0) - t.amt
    n[t.to] = (n[t.to] ?? 0) + t.amt
  }
  return n
}

/** Fewest payments that settle everyone. */
export function simplified(ledger: Pick<Ledger, 'bills' | 'payments'>): Transfer[] {
  const n = nets(ledger)
  const d: { p: string; a: number }[] = []
  const c: { p: string; a: number }[] = []
  for (const p of Object.keys(n)) {
    if (n[p] < 0) d.push({ p, a: -n[p] })
    else if (n[p] > 0) c.push({ p, a: n[p] })
  }
  const desc = (x: { a: number }, y: { a: number }) => y.a - x.a
  d.sort(desc)
  c.sort(desc)
  const out: Transfer[] = []
  let i = 0
  let j = 0
  while (i < d.length && j < c.length) {
    const m = Math.min(d[i].a, c[j].a)
    out.push({ from: d[i].p, to: c[j].p, amt: m })
    d[i].a -= m
    c[j].a -= m
    if (!d[i].a) i++
    if (!c[j].a) j++
  }
  return out
}

/** The payments people would actually make, following the ledger's simplify setting. */
export const transfers = (ledger: Ledger): Transfer[] => (ledger.simplify ? simplified(ledger) : debts(ledger))

export const myNet = (ledger: Ledger, me: PersonId): Cents => nets(ledger)[me] ?? 0

/**
 * Is this person part of the ledger's money? Members count, but so does anyone named in a bill or payment, so a friend
 * who has been invited but has not accepted yet (or has left) still has their balance counted.
 */
export function involves(L: Pick<Ledger, 'members' | 'bills' | 'payments'>, p: PersonId): boolean {
  return L.members.includes(p) || L.bills.some((b) => b.people.includes(p) || b.payer === p || (b.paid != null && p in b.paid)) || L.payments.some((x) => x.from === p || x.to === p)
}

/** Combined balance with one person across every ledger (positive: they owe me). */
export function pairNet(ledgers: Ledger[], me: PersonId, pid: PersonId) {
  let tot = 0
  const parts: { ledger: Ledger; amt: Cents }[] = []
  for (const L of ledgers) {
    if (!involves(L, pid) || !involves(L, me)) continue
    let amt = 0
    for (const t of transfers(L)) {
      if (t.from === pid && t.to === me) amt += t.amt
      if (t.from === me && t.to === pid) amt -= t.amt
    }
    if (amt) parts.push({ ledger: L, amt })
    tot += amt
  }
  return { tot, parts }
}

/** Overall totals netted per person across all ledgers. */
export function overall(ledgers: Ledger[], me: PersonId, people: PersonId[]) {
  let owe = 0
  let owed = 0
  for (const p of people) {
    if (p === me) continue
    const t = pairNet(ledgers, me, p).tot
    if (t < 0) owe -= t
    else owed += t
  }
  return { owe, owed }
}

export interface PaymentStep {
  ledger: Ledger | null
  amt: Cents
}

/**
 * Where a payment between me and one person lands: their 1-1 ledger first,
 * then shared groups, with any leftover credited to the 1-1 ledger.
 */
export function planPayment(
  ledgers: Ledger[],
  me: PersonId,
  pid: PersonId,
  direction: 'out' | 'in',
  amt: Cents,
  /** where a leftover goes when there is no 1-1 ledger: a shared group instead of a new 1-1 (used when the 1-1 is in another currency) */
  creditGroup = false,
): { from: PersonId; to: PersonId; steps: PaymentStep[] } {
  const from = direction === 'out' ? me : pid
  const to = direction === 'out' ? pid : me
  let rem = amt
  const steps: PaymentStep[] = []
  const shared = ledgers
    .filter((L) => involves(L, pid) && involves(L, me))
    .sort((a, b) => Number(b.kind === 'one') - Number(a.kind === 'one'))
  for (const L of shared) {
    for (const t of transfers(L)) {
      if (rem > 0 && t.from === from && t.to === to) {
        const u = Math.min(rem, t.amt)
        steps.push({ ledger: L, amt: u })
        rem -= u
      }
    }
  }
  if (rem > 0) steps.push({ ledger: ledgers.find((L) => L.kind === 'one' && involves(L, pid)) ?? (creditGroup ? (shared[0] ?? null) : null), amt: rem })
  return { from, to, steps }
}

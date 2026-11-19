/**
 * An independent check of the money in a bill or a ledger. It does not trust the numbers saved with a bill; it recomputes
 * them and tests rules that must always hold, and it works out each person's share a second way, in exact fractions, to
 * compare with the rounded cents. Anything that does not add up comes back as a problem to read, never as a silent fix.
 */
import { allocCents } from './alloc'
import { calc, computeShares, creditsSum, discCents, itemWeights, itemsSum, paidMap } from './calc'
import { debts, nets } from './balances'
import type { Bill, BillInput, Cents, Ledger } from './types'

export interface Problem {
  /** error: the numbers cannot all be right. warn: a saved copy is out of date but what is shown is computed fresh. */
  level: 'error' | 'warn'
  code: string
  message: string
}

const fmt = (c: Cents) => `${c < 0 ? '-' : ''}$${(Math.abs(c) / 100).toFixed(2)}`

// ---- exact fractions (BigInt), so the second calculation has no rounding of its own ----
type Frac = { n: bigint; d: bigint }
const gcd = (a: bigint, b: bigint): bigint => (b === 0n ? (a < 0n ? -a : a) : gcd(b, a % b))
const frac = (n: bigint, d: bigint = 1n): Frac => {
  if (d < 0n) {
    n = -n
    d = -d
  }
  const g = gcd(n, d) || 1n
  return { n: n / g, d: d / g }
}
const plus = (a: Frac, b: Frac) => frac(a.n * b.d + b.n * a.d, a.d * b.d)
const minus = (a: Frac, b: Frac) => frac(a.n * b.d - b.n * a.d, a.d * b.d)
const times = (a: Frac, b: Frac) => frac(a.n * b.n, a.d * b.d)
const over = (a: Frac, b: Frac) => frac(a.n * b.d, a.d * b.n)
const ZERO = frac(0n)
/** A weight such as 1, 3 or 0.25 portions, as a fraction. */
const weight = (w: number): Frac => frac(BigInt(Math.round(w * 1000)), 1000n)
const toNumber = (f: Frac) => Number((f.n * 1_000_000n) / f.d) / 1_000_000

/** What each person owes, worked out exactly (not rounded): the answer the rounded cents should be within a few cents of. */
export function exactShares(b: BillInput): Record<string, number> | null {
  const sub: Record<string, Frac> = Object.fromEntries(b.people.map((p) => [p, ZERO]))
  if (b.fixed) {
    for (const p of b.people) sub[p] = frac(BigInt(b.fixed[p] ?? 0))
  } else {
    for (const it of b.items) {
      const w = itemWeights(b, it)
      if (!w) return null
      const total = Object.values(w).reduce((a, v) => plus(a, weight(v)), ZERO)
      for (const p of Object.keys(w)) sub[p] = plus(sub[p], over(times(frac(BigInt(it.price)), weight(w[p])), total))
    }
  }
  const S = Object.values(sub).reduce(plus, ZERO)
  const feeTotal = frac(BigInt(b.fixed ? 0 : b.tax + b.tip))
  const D = frac(BigInt(b.fixed ? 0 : discCents(b)))
  const part = (p: string, whole: Frac) => (S.n === 0n ? ZERO : times(whole, over(sub[p], S)))
  const fee: Record<string, Frac> = {}
  const dc: Record<string, Frac> = {}
  const ex: Record<string, Frac> = {}
  for (const p of b.people) {
    fee[p] = part(p, feeTotal)
    dc[p] = part(p, D)
    ex[p] = ZERO
  }
  for (const e of b.extras) {
    const eligible = e.split === 'even' ? b.people.filter((p) => sub[p].n > 0n) : e.split === 'pick' ? b.people.filter((p) => e.people.includes(p)) : []
    if (!eligible.length) for (const p of b.people) ex[p] = plus(ex[p], part(p, frac(BigInt(e.amt))))
    else for (const p of eligible) ex[p] = plus(ex[p], frac(BigInt(e.amt), BigInt(eligible.length)))
  }
  // extra discounts come off in proportion to what each person had of the receipt itself
  const base: Record<string, Frac> = {}
  for (const p of b.people) {
    const v = plus(sub[p], minus(fee[p], dc[p]))
    base[p] = v.n < 0n ? ZERO : v
  }
  const B = Object.values(base).reduce(plus, ZERO)
  const C = frac(BigInt(creditsSum(b)))
  const out: Record<string, number> = {}
  for (const p of b.people) {
    const cr = B.n === 0n ? ZERO : times(C, over(base[p], B))
    out[p] = toNumber(minus(plus(plus(sub[p], fee[p]), ex[p]), plus(dc[p], cr)))
  }
  return out
}

/** Check one bill. `Bill` carries the totals saved with it, which are compared with a fresh calculation. */
export function verifyBill(b: BillInput & Partial<Pick<Bill, 'shares' | 'total'>>): Problem[] {
  const out: Problem[] = []
  const push = (level: Problem['level'], code: string, message: string) => out.push({ level, code, message })
  const c = calc(b)
  const people = new Set(b.people)

  if (!c.complete) push('error', 'unassigned', 'Some items are not assigned to anyone, so their cost is in nobody’s share.')

  // the receipt must agree with its own items
  if (b.fixed) {
    const fixed = Object.values(b.fixed).reduce((a, v) => a + v, 0)
    if (fixed !== b.rt) push('error', 'receipt-mismatch', `The custom amounts add up to ${fmt(fixed)} but the receipt total is ${fmt(b.rt)}.`)
  } else {
    const parts = itemsSum(b.items) + b.tax + b.tip - discCents(b)
    if (parts !== b.rt) push('error', 'receipt-mismatch', `Items, tax and tip less discount come to ${fmt(parts)} but the receipt total is ${fmt(b.rt)} (off by ${fmt(Math.abs(parts - b.rt))}).`)
  }

  // what people owe adds up to what the bill costs
  const owed = c.rows.reduce((a, r) => a + r.total, 0)
  if (c.complete && owed !== c.total) push('error', 'shares-sum', `What people owe adds up to ${fmt(owed)} but the bill is ${fmt(c.total)}.`)
  for (const r of c.rows) if (r.total < 0) push('error', 'negative-share', `A share is negative (${fmt(r.total)}).`)

  // what people paid adds up to what the bill costs
  const pm = paidMap(b, c.total)
  const paid = Object.values(pm).reduce((a, v) => a + v, 0)
  if (paid !== c.total) push('error', 'paid-sum', `What was paid adds up to ${fmt(paid)} but the bill is ${fmt(c.total)}.`)
  for (const p of Object.keys(pm)) if (!people.has(p)) push('error', 'payer-missing', 'Someone who paid is not in the split.')

  // every item is split down to the cent
  if (!b.fixed) {
    for (const it of b.items) {
      const w = itemWeights(b, it)
      if (!w) continue
      const got = Object.values(allocCents(it.price, w)).reduce((a, v) => a + v, 0)
      if (got !== it.price) push('error', 'item-split', `“${it.name}” is split into ${fmt(got)} but costs ${fmt(it.price)}.`)
    }
  }

  // the same bill worked out a second way, in exact fractions, lands within a few cents of the rounded shares
  const exact = c.complete ? exactShares(b) : null
  if (exact) {
    // Each person's items are rounded to whole cents, and tax, tip and discounts are shared in proportion to those rounded cents.
    // So a cent of rounding can be magnified when the items are small next to the tax, tip and discounts; allow for exactly that.
    const itemTotal = b.fixed ? 0 : itemsSum(b.items)
    const shared = (b.fixed ? 0 : b.tax + b.tip + discCents(b)) + creditsSum(b)
    const magnified = itemTotal > 0 ? Math.ceil((shared * (b.items.length + 1)) / itemTotal) : 0
    const tolerance = b.items.length + b.extras.length + 3 + magnified
    for (const r of c.rows) {
      const off = Math.abs(r.total - exact[r.p])
      if (off > tolerance) push('error', 'exact-mismatch', `A share is ${fmt(r.total)} but working it out exactly gives ${fmt(Math.round(exact[r.p]))}.`)
    }
  }

  // the totals saved with the bill are only a copy; say so if they have gone out of date
  if (b.total !== undefined && b.total !== c.total) push('warn', 'stale-total', `The saved total (${fmt(b.total)}) differs from the calculated one (${fmt(c.total)}); the calculated one is used.`)
  if (b.shares) {
    const fresh = computeShares(b)
    const keys = new Set([...Object.keys(fresh), ...Object.keys(b.shares)])
    for (const k of keys) {
      if ((fresh[k] ?? 0) !== (b.shares[k] ?? 0)) {
        push('warn', 'stale-shares', 'The shares saved with the bill differ from the calculated ones; the calculated ones are used.')
        break
      }
    }
  }
  return out
}

export interface LedgerCheck {
  bills: { id: string; title: string; problems: Problem[] }[]
  payments: { id: string; problems: Problem[] }[]
  /** what everyone's balances add up to: it must be zero */
  netTotal: Cents
  /** each person's balance */
  nets: Record<string, Cents>
  problems: Problem[]
}

/** Check every bill and payment in a group or 1-1, and that the balances cancel out. */
export function verifyLedger(l: Pick<Ledger, 'bills' | 'payments'>): LedgerCheck {
  const bills = l.bills.map((b) => ({ id: b.id, title: (b as { title?: string }).title ?? b.id, problems: verifyBill(b) }))
  const payments = l.payments.map((p) => {
    const problems: Problem[] = []
    if (!(p.amt > 0)) problems.push({ level: 'error', code: 'payment-amount', message: `The payment amount (${fmt(p.amt)}) is not above zero.` })
    if (p.from === p.to) problems.push({ level: 'error', code: 'payment-self', message: 'Someone is shown paying themselves.' })
    return { id: p.id, problems }
  })
  const n = nets(l)
  const netTotal = Object.values(n).reduce((a, v) => a + v, 0)
  const problems: Problem[] = []
  if (netTotal !== 0) problems.push({ level: 'error', code: 'nets', message: `Everyone’s balances add up to ${fmt(netTotal)} instead of nothing.` })
  // the person-to-person debts and the per-person balances are two views of the same money
  const viaDebts: Record<string, number> = {}
  for (const t of debts(l)) {
    viaDebts[t.from] = (viaDebts[t.from] ?? 0) - t.amt
    viaDebts[t.to] = (viaDebts[t.to] ?? 0) + t.amt
  }
  for (const p of new Set([...Object.keys(n), ...Object.keys(viaDebts)])) {
    if ((n[p] ?? 0) !== (viaDebts[p] ?? 0)) {
      problems.push({ level: 'error', code: 'debts', message: 'The balances and the debts between people disagree.' })
      break
    }
  }
  return { bills, payments, netTotal, nets: n, problems }
}

/** True when nothing in the check is an error. */
export const passes = (c: LedgerCheck): boolean =>
  c.problems.every((p) => p.level !== 'error') && c.bills.every((b) => b.problems.every((p) => p.level !== 'error')) && c.payments.every((p) => p.problems.every((q) => q.level !== 'error'))

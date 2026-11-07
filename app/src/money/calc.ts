import { allocCents, splitEven, splitProp } from './alloc'
import type { BillInput, Cents, CalcResult, Credit, Item, PersonId } from './types'

const EPS = 1e-6

export const itemsSum = (items: Item[]): Cents => items.reduce((a, i) => a + i.price, 0)

export const extrasSum = (b: Pick<BillInput, 'extras'>): Cents => b.extras.reduce((a, e) => a + e.amt, 0)

/** Discount in cents, capped at items + tax + tip. */
export function discCents(b: Pick<BillInput, 'disc' | 'items' | 'tax' | 'tip'>): Cents {
  const d = b.disc
  if (!d) return 0
  const base = itemsSum(b.items) + b.tax + b.tip
  const c = d.m === 'pct' ? Math.round((base * d.v) / 100) : d.v
  return Math.max(0, Math.min(c, base))
}

/**
 * Each extra discount in cents, in order. A percent is worked out on the receipt total, and together they never take off
 * more than the receipt total, so a bill can never owe less than nothing.
 */
export function creditLines(b: Pick<BillInput, 'credits' | 'rt'>): { credit: Credit; amt: Cents }[] {
  let left = Math.max(0, b.rt)
  return (b.credits ?? []).map((credit) => {
    const raw = credit.m === 'pct' ? Math.round((b.rt * credit.v) / 100) : credit.v
    const amt = Math.max(0, Math.min(raw, left))
    left -= amt
    return { credit, amt }
  })
}
export const creditsSum = (b: Pick<BillInput, 'credits' | 'rt'>): Cents => creditLines(b).reduce((a, l) => a + l.amt, 0)

/** Who shares an item and how much weight each has. Null when not fully assigned. */
export function itemWeights(
  b: Pick<BillInput, 'people' | 'guests'>,
  it: Item,
): Record<PersonId, number> | null {
  const a = it.a
  if (a.mode === 'even') {
    const w: Record<PersonId, number> = {}
    for (const p of a.even) if (b.people.includes(p)) w[p] = 1 + (b.guests[p] ?? 0)
    return Object.keys(w).length ? w : null
  }
  let sum = 0
  const w: Record<PersonId, number> = {}
  for (const p of Object.keys(a.por)) {
    if (a.por[p] > 0 && b.people.includes(p)) {
      w[p] = a.por[p]
      sum += a.por[p]
    }
  }
  return sum > 0 && Math.abs(sum - it.qty) < EPS ? w : null
}

/** Work out what each person owes for one bill. */
export function calc(b: BillInput): CalcResult {
  const ids = b.people
  const idx = new Map(ids.map((p, i) => [p, i]))
  let sub = ids.map(() => 0)
  let fee = ids.map(() => 0)
  let dcs = ids.map(() => 0)
  let complete = true

  if (b.fixed) {
    sub = ids.map((p) => b.fixed?.[p] ?? 0)
  } else {
    for (const it of b.items) {
      const w = itemWeights(b, it)
      if (!w) {
        complete = false
        continue
      }
      const c = allocCents(it.price, w)
      for (const p of Object.keys(c)) sub[idx.get(p) as number] += c[p]
    }
    fee = splitProp(b.tax + b.tip, sub)
    dcs = splitProp(discCents(b), sub)
  }

  const ex = ids.map(() => 0)
  for (const e of b.extras) {
    let elig: PersonId[] | null = null
    if (e.split === 'even') elig = ids.filter((_, i) => sub[i] > 0)
    else if (e.split === 'pick') elig = ids.filter((p) => e.people.includes(p))
    if (!elig || !elig.length) {
      splitProp(e.amt, sub).forEach((v, i) => (ex[i] += v))
    } else {
      const parts = splitEven(e.amt, elig.length)
      elig.forEach((p, k) => (ex[idx.get(p) as number] += parts[k]))
    }
  }

  // extra discounts come off in proportion to what each person had of the receipt (items, tax and tip, less the receipt's own discount)
  const cr = splitProp(creditsSum(b), ids.map((_, i) => Math.max(0, sub[i] + fee[i] - dcs[i])))

  return {
    rows: ids.map((p, i) => ({
      p,
      sub: sub[i],
      fee: fee[i],
      dc: dcs[i],
      ex: ex[i],
      cr: cr[i],
      total: sub[i] + fee[i] - dcs[i] + ex[i] - cr[i],
    })),
    total: b.rt + extrasSum(b) - creditsSum(b),
    complete,
  }
}

/** Shares per person (only people who owe something). */
export function computeShares(b: BillInput): Record<PersonId, Cents> {
  const out: Record<PersonId, Cents> = {}
  for (const r of calc(b).rows) if (r.total > 0) out[r.p] = r.total
  return out
}

/** Who paid how much. A single payer paid the whole total. */
export function paidMap(b: Pick<BillInput, 'paid' | 'payer'>, total: Cents): Record<PersonId, Cents> {
  const k = b.paid ? Object.keys(b.paid).filter((p) => (b.paid as Record<string, number>)[p] > 0) : []
  if (k.length) return Object.fromEntries(k.map((p) => [p, (b.paid as Record<string, number>)[p]]))
  return { [b.payer]: total }
}

/** Price of an item for display: the typed unit price times quantity when entered "each". */
export function itemLineTotal(qty: number, typed: Cents, each: boolean): Cents {
  return each ? typed * qty : typed
}

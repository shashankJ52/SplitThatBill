import type { Cents } from './types'

/** Split cents evenly. Leftover pennies go to the first people in order. */
export function splitEven(cents: Cents, n: number): Cents[] {
  const base = Math.floor(cents / n)
  const rem = cents - base * n
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0))
}

/** Share a fee in proportion to subtotals. Leftovers go to the first people with a subtotal. */
export function splitProp(fee: Cents, subs: Cents[]): Cents[] {
  const tot = subs.reduce((a, b) => a + b, 0)
  if (!tot) return subs.map(() => 0)
  const out = subs.map((s) => Math.floor((fee * s) / tot))
  let left = fee - out.reduce((a, b) => a + b, 0)
  for (let i = 0; i < out.length && left > 0; i++) {
    if (subs[i] > 0) {
      out[i]++
      left--
    }
  }
  return out
}

/**
 * Split a price across weights so the cents add up exactly.
 * Largest remainder method; ties go to the earlier person.
 */
export function allocCents(price: Cents, weights: Record<string, number>): Record<string, Cents> {
  const ids = Object.keys(weights).filter((k) => weights[k] > 0)
  const out: Record<string, Cents> = {}
  const total = ids.reduce((a, k) => a + weights[k], 0)
  if (!total) return out
  let used = 0
  const frac: { k: string; r: number; i: number }[] = []
  ids.forEach((k, i) => {
    const raw = (price * weights[k]) / total
    const f = Math.floor(raw + 1e-9)
    out[k] = f
    used += f
    frac.push({ k, r: raw - f, i })
  })
  frac.sort((a, b) => b.r - a.r || a.i - b.i)
  for (let j = 0; used < price && j < frac.length; j++, used++) out[frac[j].k]++
  return out
}

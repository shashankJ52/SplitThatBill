import { computeShares, calc } from './calc'
import type { Bill, BillInput, Item, Ledger, PersonId } from './types'

export const ev = (even: PersonId[]): Item['a'] => ({ mode: 'even', even, por: {} })
export const por = (p: Record<PersonId, number>): Item['a'] => ({ mode: 'por', even: [], por: p })

export function item(id: number, name: string, price: number, a: Item['a'], qty = 1): Item {
  return { id, name, qty, price, a }
}

export function bill(id: string, o: Partial<BillInput> & Pick<BillInput, 'people' | 'items' | 'payer' | 'rt'>): Bill {
  const b: BillInput = { tax: 0, tip: 0, disc: null, extras: [], guests: {}, paid: null, fixed: null, ...o }
  return { ...b, id, shares: computeShares(b), total: calc(b).total }
}

export function ledger(id: string, kind: 'group' | 'one', members: PersonId[], bills: Bill[] = [], opts: Partial<Ledger> = {}): Ledger {
  return { id, kind, members, bills, payments: [], simplify: false, ...opts }
}

/** tiny seeded random numbers so property tests are repeatable */
export function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

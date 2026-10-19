import { calc, computeShares, type BillInput, type Item, type PersonId } from '../money'
import type { AppBill } from './types'
import { token } from './util'

export const ev = (even: PersonId[]): Item['a'] => ({ mode: 'even', even, por: {} })
export const por = (p: Record<PersonId, number>): Item['a'] => ({ mode: 'por', even: [], por: p })

export function item(id: number, name: string, price: number, a: Item['a'], qty = 1): Item {
  return { id, name, qty, price, a }
}

type Required = 'id' | 'title' | 'date' | 'payer' | 'by' | 'rt' | 'people' | 'items'

/** Build a bill with its cached shares and total filled in. */
export function makeBill(o: Partial<AppBill> & Pick<AppBill, Required>): AppBill {
  const base = {
    loc: '', cat: 'Other', paid: null, tax: 0, tip: 0, disc: null, fixed: null, extras: [], guests: {},
    notes: '', token: token(), comments: [], ...o,
  }
  const input: BillInput = base
  return { ...base, shares: computeShares(input), total: calc(input).total }
}

/** Recompute cached shares and total after editing a bill. */
export function refreshBill(b: AppBill): AppBill {
  return { ...b, shares: computeShares(b), total: calc(b).total }
}

export const CATEGORIES = [
  { k: 'Groceries', c: '#00933C' },
  { k: 'Eating out', c: '#FF6319' },
  { k: 'Subscriptions', c: '#B933AD' },
  { k: 'Furniture', c: '#996633' },
  { k: 'Fuel & travel', c: '#FCCC0A' },
  { k: 'Sports', c: '#6CBE45' },
  { k: 'Movies & fun', c: '#EE352E' },
  { k: 'Other', c: '#A7A9AC' },
] as const

export const categoryColor = (k: string) => CATEGORIES.find((c) => c.k === k)?.c ?? '#A7A9AC'

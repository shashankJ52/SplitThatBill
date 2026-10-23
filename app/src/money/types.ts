// Money is always whole cents. Portions and guest weights are plain numbers.
export type PersonId = string
export type Cents = number

export interface ItemAssign {
  mode: 'even' | 'por'
  /** people sharing evenly (mode "even") */
  even: PersonId[]
  /** portions per person (mode "por"); must add up to the item quantity */
  por: Record<PersonId, number>
}

export interface Item {
  id: number
  name: string
  qty: number
  /** line total in cents (price for all of the quantity) */
  price: Cents
  /** set when the user typed the price as "each" */
  pe?: 'each'
  /** price of one, in cents, when pe is "each" */
  unit?: Cents
  a: ItemAssign
}

export type ExtraSplit = 'even' | 'prop' | 'pick'

export interface Extra {
  id: number
  name: string
  amt: Cents
  split: ExtraSplit
  people: PersonId[]
}

export interface Discount {
  /** "amt" is cents, "pct" is a percent such as 10 or 12.5 */
  m: 'amt' | 'pct'
  v: number
}

export interface BillInput {
  /** who is in this split */
  people: PersonId[]
  items: Item[]
  tax: Cents
  tip: Cents
  disc?: Discount | null
  /** receipt total in cents, after discount */
  rt: Cents
  extras: Extra[]
  /** extra guests per person ("+1s"), counted on evenly split items */
  guests: Record<PersonId, number>
  /** single payer when paid is empty */
  payer: PersonId
  /** exact amounts paid when several people paid */
  paid?: Record<PersonId, Cents> | null
  /** whole-bill custom amounts per person (replaces item-by-item) */
  fixed?: Record<PersonId, Cents> | null
}

export interface Row {
  p: PersonId
  sub: Cents
  fee: Cents
  dc: Cents
  ex: Cents
  total: Cents
}

export interface CalcResult {
  rows: Row[]
  total: Cents
  /** false when some item is not fully assigned */
  complete: boolean
}

export interface Payment {
  id: string
  from: PersonId
  to: PersonId
  amt: Cents
}

export interface Transfer {
  from: PersonId
  to: PersonId
  amt: Cents
}

export interface Bill extends BillInput {
  id: string
  /** cached shares per person, from calc() */
  shares: Record<PersonId, Cents>
  total: Cents
}

export interface Ledger {
  id: string
  /** 'me' is the owner's own private ledger: bills only they are in, no one to split with */
  kind: 'group' | 'one' | 'me'
  members: PersonId[]
  simplify?: boolean
  bills: Bill[]
  payments: Payment[]
}

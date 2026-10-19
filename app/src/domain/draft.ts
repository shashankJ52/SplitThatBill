import { calc, discCents, extrasSum, itemsSum, itemWeights, type Discount, type Extra, type ExtraSplit, type Item, type PersonId } from '../money'
import { ev, makeBill } from './bills'
import { ledgerById, realGroups } from './selectors'
import { ME, type AppBill, type AppLedger, type AppState, type Comment } from './types'

/**
 * The bill being built or edited in the split flow. Everything here is a plain value,
 * so every step is a pure `(draft, args) => draft` function that can be tested.
 */
export interface Draft {
  id: string
  /** id of the saved bill when editing one, otherwise null */
  editingId: string | null
  /** the ledger being edited (kind "group" or a 1-1), when editing */
  ledgerId: string | null
  kind: 'group' | 'one'
  /** group id when kind is "group" */
  gid: string | null
  /** the other person for a 1-1 split */
  withP: PersonId | null
  /** "g:<id>", "p:<id>", "new" (someone new) or "" */
  target: string
  people: PersonId[]
  title: string
  loc: string
  cat: string
  date: string
  notes: string
  token: string
  by: PersonId
  comments: Comment[]
  items: Item[]
  nextId: number
  extras: Extra[]
  nextE: number
  tax: number
  tip: number
  disc: Discount | null
  /** receipt total in cents */
  rt: number
  guests: Record<PersonId, number>
  payer: PersonId
  paid: Record<PersonId, number>
  multi: boolean
  fixed: Record<PersonId, number> | null
  /** items typed by hand: the total is whatever the items add up to */
  manual: boolean
  /** what the quick-add price means for quantities above one */
  qm: 'total' | 'each'
}

export type Result = { d: Draft; err?: undefined } | { d: Draft; err: string }
const ok = (d: Draft): Result => ({ d })
const bad = (d: Draft, err: string): Result => ({ d, err })

/** The sample receipt that stands in for OCR until the scan function exists. */
export const SAMPLE_RECEIPT = {
  title: 'Trattoria Roma',
  loc: '12 Main St',
  cat: 'Eating out',
  rt: 15040,
  tax: 940,
  tip: 2350,
  items: [
    { n: 'Caesar Salad', q: 1, p: 1250 },
    { n: 'Ribeye Steak', q: 1, p: 3800 },
    { n: 'Pasta Carbonara', q: 1, p: 1900 },
    { n: 'Nachos (shared)', q: 1, p: 1400 },
    { n: 'Beer', q: 3, p: 1800 },
    { n: 'Cola', q: 2, p: 700 },
    { n: 'Tiramisu', q: 1, p: 900 },
  ],
}

export interface NewDraftIds {
  id: string
  token: string
  date: string
}

/** Where a new split goes by default: the asked-for group or person, else the most recent group. */
export function defaultTarget(s: AppState, want?: string | null): string {
  if (want?.startsWith('g:') && ledgerById(s, want.slice(2))?.kind === 'group') return want
  if (want?.startsWith('p:') && s.people[want.slice(2)] && want.slice(2) !== ME) return want
  const g = realGroups(s)[0]
  return g ? `g:${g.id}` : 'new'
}

export function loadSample(d: Draft): Draft {
  const r = SAMPLE_RECEIPT
  return {
    ...d,
    items: r.items.map((x, i) => ({ id: i + 1, name: x.n, qty: x.q, price: x.p, a: ev([]) })),
    nextId: r.items.length + 1,
    rt: r.rt,
    tax: r.tax,
    tip: r.tip,
    disc: null,
    fixed: null,
    title: r.title,
    loc: r.loc,
    cat: r.cat,
    manual: false,
  }
}

export function startManual(d: Draft): Draft {
  return { ...d, manual: true, items: [], nextId: 1, rt: 0, tax: 0, tip: 0, disc: null, fixed: null, title: 'New bill', loc: '', cat: 'Other' }
}

export function newDraft(s: AppState, ids: NewDraftIds, want?: string | null): Draft {
  const blank: Draft = {
    id: ids.id, editingId: null, ledgerId: null, kind: 'group', gid: null, withP: null, target: '', people: [ME],
    title: '', loc: '', cat: 'Other', date: ids.date, notes: '', token: ids.token, by: ME, comments: [],
    items: [], nextId: 1, extras: [], nextE: 1, tax: 0, tip: 0, disc: null, rt: 0, guests: {},
    payer: ME, paid: {}, multi: false, fixed: null, manual: false, qm: 'total',
  }
  return setTarget(s, loadSample(blank), defaultTarget(s, want))
}

/** Pick who the bill is shared with. Changing it clears assignments, since the people changed. */
export function setTarget(s: AppState, d: Draft, target: string): Draft {
  let kind: Draft['kind'] = 'one'
  let gid: string | null = null
  let withP: PersonId | null = null
  let people: PersonId[] = [ME]
  if (target.startsWith('g:')) {
    const g = ledgerById(s, target.slice(2))
    if (g) {
      kind = 'group'
      gid = g.id
      people = g.members.slice()
    }
  } else if (target.startsWith('p:')) {
    withP = target.slice(2)
    people = [ME, withP]
  }
  return {
    ...d, target, kind, gid, withP, people,
    items: d.items.map((i) => ({ ...i, a: ev([]) })),
    extras: d.extras.map((e) => ({ ...e, people: [] })),
    guests: {}, fixed: null, payer: ME, multi: false, paid: {},
  }
}

/** Turn a saved bill back into a draft for editing. */
export function draftFromBill(b: AppBill, ledger: AppLedger): Draft {
  const paid = b.paid ?? {}
  return {
    id: b.id, editingId: b.id, ledgerId: ledger.id,
    kind: ledger.kind, gid: ledger.kind === 'group' ? ledger.id : null, withP: ledger.with ?? null,
    target: ledger.kind === 'group' ? `g:${ledger.id}` : `p:${ledger.with}`,
    people: b.people.slice(), title: b.title, loc: b.loc, cat: b.cat, date: b.date, notes: b.notes, token: b.token, by: b.by,
    comments: b.comments.slice(),
    items: structuredClone(b.items),
    nextId: b.items.reduce((m, i) => Math.max(m, i.id), 0) + 1,
    extras: structuredClone(b.extras),
    nextE: b.extras.reduce((m, e) => Math.max(m, e.id), 0) + 1,
    tax: b.tax, tip: b.tip, disc: b.disc ? { ...b.disc } : null, rt: b.rt,
    guests: { ...b.guests }, payer: b.payer, paid: { ...paid }, multi: Object.keys(paid).length > 1,
    fixed: b.fixed ? { ...b.fixed } : null, manual: false, qm: 'total',
  }
}

// ---------- totals ----------
export const draftItemsSum = (d: Draft) => itemsSum(d.items)
/** Receipt total shown for a manual bill: whatever the items, tax and tip add up to, less discount. */
export const syncRt = (d: Draft): Draft => (d.manual ? { ...d, rt: Math.max(0, itemsSum(d.items) + d.tax + d.tip - discCents(d)) } : d)
const keep = (d: Draft) => syncRt(d)
/** Items + tax + tip − discount. */
export const itemsPlusFees = (d: Draft) => itemsSum(d.items) + d.tax + d.tip - discCents(d)
export const reconciles = (d: Draft) => itemsPlusFees(d) === d.rt
/** Receipt total plus extras: what the payers must cover. */
export const grandTotal = (d: Draft) => d.rt + extrasSum(d)
export const paidSum = (d: Draft) => Object.values(d.paid).reduce((a, v) => a + (v || 0), 0)
export const extrasOk = (d: Draft) => d.extras.every((e) => e.amt > 0 && e.name.trim())
export const isAssigned = (d: Draft, it: Item) => !!itemWeights(d, it)
export const unassigned = (d: Draft): Item[] => (d.fixed ? [] : d.items.filter((i) => !isAssigned(d, i)))
export const porSum = (it: Item) => Object.values(it.a.por).reduce((a, v) => a + (v || 0), 0)
export const porStepOf = (it: Item) => (it.qty >= 2 ? 0.5 : 0.25)

export function canContinue(d: Draft, step: 'review' | 'assign' | 'details' | 'summary'): boolean {
  if (step === 'review') return d.items.length > 0 && extrasOk(d) && (d.manual ? itemsSum(d.items) > 0 : reconciles(d))
  if (step === 'assign') return d.items.length > 0 && unassigned(d).length === 0
  return !d.multi || paidSum(d) === grandTotal(d)
}

// ---------- items ----------
const upd = (d: Draft, id: number, fn: (i: Item) => Item): Draft => keep({ ...d, items: d.items.map((i) => (i.id === id ? fn(i) : i)) })

export interface NewItem {
  name: string
  qty: number
  /** the price as typed, in cents */
  price: number
  each: boolean
}

export function addItem(d: Draft, n: NewItem): Result {
  if (!Number.isInteger(n.qty) || n.qty < 1 || n.qty > 99) return bad(d, 'Quantity must be 1–99')
  if (!(n.price > 0)) return bad(d, 'Enter a price like 12.50')
  const each = n.qty > 1 && n.each
  const it: Item = { id: d.nextId, name: n.name.trim() || `Item ${d.items.length + 1}`, qty: n.qty, price: each ? n.price * n.qty : n.price, a: ev([]) }
  if (each) {
    it.pe = 'each'
    it.unit = n.price
  }
  return ok(keep({ ...d, items: [...d.items, it], nextId: d.nextId + 1 }))
}

export const removeItem = (d: Draft, id: number): Draft => keep({ ...d, items: d.items.filter((i) => i.id !== id) })
export const setItemName = (d: Draft, id: number, name: string): Draft => upd(d, id, (i) => ({ ...i, name: name.trim() || 'Unnamed' }))

export function setItemQty(d: Draft, id: number, qty: number): Result {
  if (!Number.isInteger(qty) || qty < 1 || qty > 99) return bad(d, 'Quantity must be 1–99')
  return ok(
    upd(d, id, (i) => {
      const next: Item = { ...i, qty }
      if (qty === 1) {
        delete next.pe
        delete next.unit
      } else if (i.pe === 'each') next.price = (i.unit as number) * qty
      // portions are sized to the old quantity, so start them over
      if (i.a.mode === 'por' && qty !== i.qty) next.a = ev([])
      return next
    }),
  )
}

/** Set the typed price. When the price means "each", it is multiplied by the quantity. */
export const setItemPrice = (d: Draft, id: number, cents: number): Draft =>
  upd(d, id, (i) => (i.pe === 'each' ? { ...i, unit: cents, price: cents * i.qty } : { ...i, price: cents }))

/** Switch between "price is for all" and "price is each". Returns a note if the total had to be rounded. */
export function setItemPe(d: Draft, id: number, m: 'total' | 'each'): { d: Draft; rounded?: number } {
  let rounded: number | undefined
  const out = upd(d, id, (i) => {
    if ((m === 'each') === (i.pe === 'each')) return i
    if (m === 'each') {
      const unit = Math.round(i.price / i.qty)
      if (unit * i.qty !== i.price) rounded = unit
      return { ...i, pe: 'each', unit, price: unit * i.qty }
    }
    const next = { ...i }
    delete next.pe
    delete next.unit
    return next
  })
  return { d: out, rounded }
}

export const acceptSum = (d: Draft): Draft => ({ ...d, rt: itemsPlusFees(d) })

// ---------- assigning ----------
const toggle = (a: PersonId[], p: PersonId) => (a.includes(p) ? a.filter((x) => x !== p) : [...a, p])

export function toggleEven(d: Draft, id: number, p: PersonId): Draft {
  return upd(d, id, (i) => (i.a.mode === 'even' ? { ...i, a: { ...i.a, even: toggle(i.a.even, p) } } : i))
}

export function setItemMode(d: Draft, id: number, m: 'even' | 'por'): Draft {
  return upd(d, id, (it) => {
    if (it.a.mode === m) return it
    if (m === 'por') {
      const n = it.a.even.length
      const step = porStepOf(it)
      const por: Record<PersonId, number> = {}
      if (n) {
        const base = Math.floor(it.qty / n / step) * step
        const rem = Math.round((it.qty - base * n) / step)
        it.a.even.forEach((p, i) => {
          por[p] = base + (i < rem ? step : 0)
        })
      }
      return { ...it, a: { mode: 'por', even: [], por } }
    }
    return { ...it, a: { mode: 'even', even: Object.keys(it.a.por).filter((p) => it.a.por[p] > 0), por: {} } }
  })
}

export function porStep(d: Draft, id: number, p: PersonId, dir: 1 | -1): Draft {
  return upd(d, id, (it) => {
    if (it.a.mode !== 'por') return it
    const v = Math.max(0, Math.min(99, Math.round(((it.a.por[p] || 0) + porStepOf(it) * dir) * 100) / 100))
    return { ...it, a: { ...it.a, por: { ...it.a.por, [p]: v } } }
  })
}

export const stepGuest = (d: Draft, p: PersonId, dir: 1 | -1): Draft => ({
  ...d,
  guests: { ...d.guests, [p]: Math.max(0, Math.min(9, (d.guests[p] || 0) + dir)) },
})

// ---------- tax, tip, discount ----------
export const setFee = (d: Draft, k: 'tax' | 'tip' | 'rt', cents: number): Draft => keep({ ...d, [k]: cents })
export const addDiscount = (d: Draft): Draft => keep({ ...d, disc: { m: 'pct', v: 0 } })
export const setDiscountMode = (d: Draft, m: Discount['m']): Draft => keep({ ...d, disc: { m, v: 0 } })
export const removeDiscount = (d: Draft): Draft => keep({ ...d, disc: null })

/** Set the discount value: cents for "amt", a percent from 0.01 to 100 for "pct". */
export function setDiscountValue(d: Draft, v: number): Result {
  if (!d.disc) return ok(d)
  if (!(v > 0) || (d.disc.m === 'pct' && v > 100)) return bad(d, d.disc.m === 'amt' ? 'Enter a valid amount' : 'Enter a percent between 0.01 and 100')
  return ok(keep({ ...d, disc: { ...d.disc, v } }))
}

// ---------- extras ----------
export const addExtra = (d: Draft): Draft => ({ ...d, extras: [...d.extras, { id: d.nextE, name: 'Transport', amt: 0, split: 'even', people: [] }], nextE: d.nextE + 1 })
export const removeExtra = (d: Draft, id: number): Draft => ({ ...d, extras: d.extras.filter((e) => e.id !== id) })
export const patchExtra = (d: Draft, id: number, patch: Partial<Pick<Extra, 'name' | 'amt' | 'split'>>): Draft => ({
  ...d,
  extras: d.extras.map((e) => (e.id === id ? { ...e, ...patch, name: patch.name !== undefined ? patch.name : e.name } : e)),
})
export const toggleExtraPerson = (d: Draft, id: number, p: PersonId): Draft => ({
  ...d,
  extras: d.extras.map((e) => (e.id === id ? { ...e, people: toggle(e.people, p) } : e)),
})
export type { ExtraSplit }

// ---------- who paid ----------
export function setPayer(d: Draft, v: string): Draft {
  if (v === '__multi') return { ...d, multi: true, paid: { [d.payer]: grandTotal(d) } }
  return { ...d, multi: false, paid: {}, payer: v }
}
export const setPaid = (d: Draft, p: PersonId, cents: number): Draft => ({ ...d, paid: { ...d.paid, [p]: cents } })
/** Give a person whatever is not yet covered by the others. */
export function paidRest(d: Draft, p: PersonId): Draft {
  const others = Object.entries(d.paid).reduce((a, [k, v]) => (k === p ? a : a + (v || 0)), 0)
  return setPaid(d, p, Math.max(0, grandTotal(d) - others))
}
export const setMeta = (d: Draft, patch: Partial<Pick<Draft, 'title' | 'loc' | 'cat' | 'date' | 'notes'>>): Draft => ({ ...d, ...patch })

// ---------- whole-bill split ----------
export interface WholeSplit {
  mode: 'eq' | 'amt'
  sel: PersonId[]
  amt: Record<PersonId, number>
  g: Record<PersonId, number>
}

export function wholeFromDraft(d: Draft): WholeSplit {
  return { mode: d.fixed ? 'amt' : 'eq', sel: d.fixed ? Object.keys(d.fixed) : d.people.slice(), amt: { ...(d.fixed ?? {}) }, g: { ...d.guests } }
}

export function applyWhole(d: Draft, w: WholeSplit): Result {
  if (!w.sel.length) return bad(d, 'Pick at least one person')
  if (w.mode === 'eq') {
    const guests: Record<PersonId, number> = {}
    w.sel.forEach((p) => {
      if (w.g[p]) guests[p] = w.g[p]
    })
    return ok({ ...d, fixed: null, items: d.items.map((i) => ({ ...i, a: ev(w.sel.slice()) })), guests })
  }
  const fixed: Record<PersonId, number> = {}
  let sum = 0
  for (const p of w.sel) {
    if (w.amt[p] > 0) {
      fixed[p] = w.amt[p]
      sum += w.amt[p]
    }
  }
  if (sum !== d.rt || !Object.keys(fixed).length) return bad(d, 'Amounts must add up to the receipt total')
  return ok({ ...d, fixed })
}
export const clearWhole = (d: Draft): Draft => ({ ...d, fixed: null })

// ---------- saving ----------
/** Build the bill to store. Several payers are kept only when each paid something. */
export function toBill(d: Draft): AppBill {
  let paid: Record<PersonId, number> | null = null
  let payer = d.payer
  if (d.multi) {
    paid = {}
    let best: PersonId | null = null
    for (const [k, v] of Object.entries(d.paid)) {
      if (v > 0) {
        paid[k] = v
        if (!best || v > d.paid[best]) best = k
      }
    }
    payer = best ?? d.payer
  }
  return makeBill({
    id: d.id, title: d.title.trim() || 'Untitled bill', loc: d.loc.trim(), cat: d.cat, date: d.date, by: d.by, notes: d.notes.trim(),
    token: d.token, comments: d.comments, people: d.people, items: d.items, tax: d.tax, tip: d.tip, disc: d.disc, rt: d.rt,
    extras: d.extras, guests: d.guests, payer, paid, fixed: d.fixed,
  })
}

/** Quick preview of the shares for the Summary step. */
export const draftCalc = (d: Draft) => calc({ ...d, paid: d.multi ? d.paid : null })

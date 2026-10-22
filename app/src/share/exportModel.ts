import { calc, discCents, itemWeights, paidMap, type Cents } from '../money'
import type { ShareBill } from '../domain/share'
import { personName } from '../domain/selectors'
import type { AppState } from '../domain/types'

/** Route-bullet colors given to people in order, so the same person looks the same in every picture. */
export const PERSON_COLORS = ['#0039A6', '#FF6319', '#00933C', '#B933AD', '#EE352E', '#996633', '#6CBE45', '#A7A9AC', '#FCCC0A'] as const

export interface ExportPerson {
  name: string
  letter: string
  color: string
}

export interface ExportLine {
  name: string
  qty: number
  price: Cents
  /** indexes into `people` of everyone sharing this line */
  who: number[]
}

export interface ExportExtra {
  label: string
  amt: Cents
  /** shown with a minus (a discount) */
  minus?: boolean
}

/** Everything a bill picture needs, already worked out, so the drawing code only draws. */
export interface ExportModel {
  title: string
  loc: string
  date: string
  groupName: string | null
  currency: string
  total: Cents
  paidBy: string
  /** who paid and how much, biggest first (one person, or several when the bill was paid together) */
  payers: { person: ExportPerson; paid: Cents }[]
  people: ExportPerson[]
  /** empty when the whole bill was split by custom amounts instead of item by item */
  lines: ExportLine[]
  extras: ExportExtra[]
  /** what each person owes (positive) or is owed (negative) after what they paid; settled people are left out */
  settle: { person: ExportPerson; net: Cents }[]
  /** the link to the bill, when there is one to put on the picture */
  link: string | null
}

/** Work out the picture's content for one bill. Names are the ones other people would see ("You" becomes your first name). */
export function buildExportModel(s: AppState, b: ShareBill, opts: { groupName: string | null; currency: string; link: string | null }): ExportModel {
  const c = calc(b)
  const pm = paidMap(b, c.total)
  const people: ExportPerson[] = b.people.map((p, i) => {
    const name = personName(s, p, true)
    return { name, letter: (name.trim().charAt(0) || '?').toUpperCase(), color: PERSON_COLORS[i % PERSON_COLORS.length] }
  })
  const at = new Map(b.people.map((p, i) => [p, i]))
  const lines: ExportLine[] = b.fixed
    ? []
    : b.items.map((it) => {
        const w = itemWeights(b, it)
        const who = w ? Object.keys(w).filter((p) => w[p] > 0).map((p) => at.get(p) as number).filter((i) => i !== undefined) : []
        return { name: it.name, qty: it.qty, price: it.price, who }
      })
  const extras: ExportExtra[] = []
  if (b.tax > 0) extras.push({ label: 'Tax', amt: b.tax })
  if (b.tip > 0) extras.push({ label: 'Tip', amt: b.tip })
  const dc = discCents(b)
  if (dc > 0) extras.push({ label: 'Discount', amt: dc, minus: true })
  for (const e of b.extras) extras.push({ label: e.name, amt: e.amt })
  const settle = c.rows
    .map((r) => ({ person: people[at.get(r.p) as number], net: r.total - (pm[r.p] ?? 0) }))
    .filter((x) => x.person && x.net !== 0)
    .sort((a, z) => z.net - a.net)
  const payerNames = Object.keys(pm).map((p) => personName(s, p, true))
  const payers = Object.keys(pm)
    .filter((p) => at.has(p))
    .map((p) => ({ person: people[at.get(p) as number], paid: pm[p] }))
    .sort((a, z) => z.paid - a.paid)
  return {
    title: b.title.trim() || 'Bill',
    loc: b.loc.trim(),
    date: b.date,
    groupName: opts.groupName,
    currency: opts.currency,
    total: c.total,
    paidBy: payerNames.join(' & '),
    payers,
    people,
    lines,
    extras,
    settle,
    link: opts.link,
  }
}

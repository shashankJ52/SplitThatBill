import { calc, paidMap, type BillInput } from '../money'
import type { AppState } from './types'
import { personName } from './selectors'
import { fmt } from './util'

export interface ShareBill extends BillInput {
  title: string
  loc: string
  date: string
}

/** The link anyone can open to see one bill (items, split and notes only). */
export const billLink = (origin: string, token: string) => `${origin}/b/${token}`

/**
 * The WhatsApp message. It is read by other people, so "You" becomes your first name,
 * and it only mentions this bill: nothing about earlier balances.
 */
export function whatsappText(s: AppState, b: ShareBill, groupName: string | null, link: string): string {
  const c = calc(b)
  const pm = paidMap(b, c.total)
  const name = (p: string) => personName(s, p, true)
  const owes = c.rows
    .filter((r) => r.total - (pm[r.p] ?? 0) > 0)
    .map((r) => `• ${name(r.p)} owes ${fmt(r.total - (pm[r.p] ?? 0))}`)
  const payers = Object.keys(pm).map(name).join(' & ')
  return [
    `🧾 ${b.title}`,
    b.loc ? `📍 ${b.loc}` : null,
    `${groupName ? `${groupName} · ` : ''}${b.date}`,
    `Total ${fmt(c.total)} · paid by ${payers}`,
    '',
    owes.join('\n') || 'Nobody owes anything.',
    '',
    `See the full split: ${link}`,
  ]
    .filter((x) => x !== null)
    .join('\n')
}

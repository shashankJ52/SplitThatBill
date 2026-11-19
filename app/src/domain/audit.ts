import { calc, paidMap, passes, verifyLedger, type LedgerCheck, type Problem } from '../money'
import { ledgerName, personName } from './selectors'
import type { AppLedger, AppState } from './types'

const money = (c: number) => `${c < 0 ? '-' : ''}$${(Math.abs(c) / 100).toFixed(2)}`

export interface AuditLine {
  /** "bill" or "payment" */
  kind: 'bill' | 'payment'
  id: string
  date: string
  title: string
  /** one line of the numbers, for reading and for copying */
  detail: string
  problems: Problem[]
}

export interface LedgerAudit {
  id: string
  name: string
  bills: number
  payments: number
  lines: AuditLine[]
  /** balances after everything in the group, by person name */
  balances: { name: string; net: number }[]
  check: LedgerCheck
  ok: boolean
  /** problems that are not about one bill or payment */
  general: Problem[]
}

/** Check every bill and payment in one group or 1-1, with the numbers written out so they can be read against the screen. */
export function auditLedger(s: AppState, l: AppLedger): LedgerAudit {
  const check = verifyLedger(l)
  const nm = (p: string) => personName(s, p, true)
  const lines: AuditLine[] = []
  for (const b of l.bills) {
    const c = calc(b)
    const pm = paidMap(b, c.total)
    const paid = Object.keys(pm).map((p) => `${nm(p)} ${money(pm[p])}`).join(', ')
    const shares = c.rows.filter((r) => r.total > 0).map((r) => `${nm(r.p)} ${money(r.total)}`).join(', ')
    lines.push({
      kind: 'bill', id: b.id, date: b.date, title: b.title,
      detail: `total ${money(c.total)} · paid by ${paid} · shares: ${shares}`,
      problems: check.bills.find((x) => x.id === b.id)?.problems ?? [],
    })
  }
  for (const p of l.payments) {
    lines.push({
      kind: 'payment', id: p.id, date: p.date, title: `${nm(p.from)} paid ${nm(p.to)}`,
      detail: money(p.amt),
      problems: check.payments.find((x) => x.id === p.id)?.problems ?? [],
    })
  }
  lines.sort((a, z) => (a.date < z.date ? -1 : a.date > z.date ? 1 : 0))
  return {
    id: l.id,
    name: ledgerName(s, l),
    bills: l.bills.length,
    payments: l.payments.length,
    lines,
    balances: Object.keys(check.nets).map((p) => ({ name: nm(p), net: check.nets[p] })).sort((a, z) => z.net - a.net),
    check,
    ok: passes(check),
    general: check.problems,
  }
}

/** Check every group and 1-1 you are in (not your private Personal ledger, which has no one to owe). */
export const auditAll = (s: AppState): LedgerAudit[] => s.ledgers.filter((l) => l.kind !== 'me').map((l) => auditLedger(s, l))

/** The whole check as plain text, to read in full or to send to someone who is helping. */
export function auditText(all: LedgerAudit[]): string {
  const out: string[] = []
  for (const a of all) {
    out.push(`${a.name}: ${a.bills} ${a.bills === 1 ? 'bill' : 'bills'}, ${a.payments} ${a.payments === 1 ? 'payment' : 'payments'}: ${a.ok ? 'every check passes' : 'PROBLEMS FOUND'}`)
    for (const l of a.lines) {
      const mark = l.problems.some((p) => p.level === 'error') ? 'X' : l.problems.length ? '~' : 'ok'
      out.push(`  [${mark}] ${l.date} ${l.kind === 'bill' ? 'bill' : 'payment'} "${l.title}": ${l.detail}`)
      for (const p of l.problems) out.push(`        ${p.level === 'error' ? 'PROBLEM' : 'note'}: ${p.message}`)
    }
    for (const p of a.general) out.push(`  PROBLEM: ${p.message}`)
    out.push(`  balances: ${a.balances.map((b) => `${b.name} ${b.net >= 0 ? 'is owed' : 'owes'} ${money(Math.abs(b.net))}`).join(', ') || 'all square'}`)
    out.push('')
  }
  return out.join('\n').trim()
}

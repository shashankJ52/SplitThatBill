import { useMemo } from 'react'
import { useAppState } from '../data/store'
import { auditAll, auditText } from '../domain/audit'
import { useToast } from '../ui/Toast'

const money = (c: number) => `$${(Math.abs(c) / 100).toFixed(2)}`

/**
 * Checks every bill and payment in every group, and shows the numbers beside the verdict. The checks recompute everything
 * from the raw items and test rules that must always hold (shares add up to the bill, payments add up to the bill, balances
 * cancel out), and work each share out a second way to compare. Nothing here changes any data.
 */
export function AuditSheet({ close }: { close: () => void }) {
  const s = useAppState()
  const toast = useToast()
  const all = useMemo(() => auditAll(s), [s])
  const bad = all.filter((a) => !a.ok)
  const transactions = all.reduce((n, a) => n + a.bills + a.payments, 0)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(auditText(all))
      toast('Report copied')
    } catch {
      toast('Copy blocked. Select the text manually.')
    }
  }

  return (
    <>
      {all.length === 0 ? (
        <div className="bar info">There are no groups or 1-1 splits to check yet.</div>
      ) : bad.length === 0 ? (
        <div className="bar ok">✓ All {transactions} bills and payments add up, in {all.length} {all.length === 1 ? 'group' : 'groups'}.</div>
      ) : (
        <div className="bar bad" role="alert">⚠ {bad.length} of {all.length} {all.length === 1 ? 'group has' : 'groups have'} something that does not add up. Open them below.</div>
      )}
      <p className="mute">Every bill is recomputed from its items and checked: shares add up to the bill, what was paid adds up to the bill, and everyone's balances cancel out. Each share is also worked out a second way and compared.</p>
      {all.map((a) => (
        <details key={a.id} className="card audit" open={!a.ok} style={{ display: 'block' }}>
          <summary>
            <b>{a.name}</b>{' '}
            <span className="mute">{a.bills} {a.bills === 1 ? 'bill' : 'bills'}, {a.payments} {a.payments === 1 ? 'payment' : 'payments'}</span>{' '}
            <span className={`pill${a.ok ? '' : ' bad'}`}>{a.ok ? 'all correct' : 'check this'}</span>
          </summary>
          {a.general.map((p) => <div className="bar bad" key={p.code} style={{ marginTop: 8 }}>{p.message}</div>)}
          <div className="audit-lines">
            {a.lines.map((l) => {
              const err = l.problems.some((p) => p.level === 'error')
              return (
                <div className={`audit-line${err ? ' err' : ''}`} key={`${l.kind}:${l.id}`}>
                  <div className="row">
                    <span className="audit-mark" aria-label={err ? 'Problem' : l.problems.length ? 'Note' : 'Correct'}>{err ? '!' : l.problems.length ? '~' : '✓'}</span>
                    <div className="grow"><b>{l.title}</b> <span className="mute">{l.kind === 'payment' ? 'payment' : 'bill'} · {l.date}</span></div>
                  </div>
                  <div className="mute audit-detail">{l.detail}</div>
                  {l.problems.map((p, i) => <div className={`audit-problem ${p.level}`} key={i}>{p.message}</div>)}
                </div>
              )
            })}
          </div>
          <div className="mute" style={{ marginTop: 8 }}>
            Balances now: {a.balances.length ? a.balances.map((b) => `${b.name} ${b.net >= 0 ? 'is owed' : 'owes'} ${money(b.net)}`).join(' · ') : 'all square'}
          </div>
        </details>
      ))}
      <div style={{ height: 10 }} />
      <button className="primary" onClick={() => void copy()}>Copy the full report</button>
      <div style={{ height: 8 }} />
      <button className="secondary" onClick={close}>Close</button>
    </>
  )
}

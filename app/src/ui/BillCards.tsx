import { Link } from 'react-router-dom'
import { useAppState } from '../data/store'
import { ledgerById, ledgerName, personName, type MergedPayment } from '../domain/selectors'
import type { AppBill } from '../domain/types'
import { ME } from '../domain/types'
import { fmt, whenLabel } from '../domain/util'
import { paidMap } from '../money'
import { PaymentSheet } from '../sheets/PaymentSheet'
import { Bullet } from './bits'
import { useSheet } from './Sheet'

export function paidText(s: Parameters<typeof personName>[0], b: AppBill, forOthers = false) {
  const k = Object.keys(paidMap(b, b.total))
  return `paid by ${k.length > 1 ? k.map((p) => personName(s, p, forOthers)).join(' & ') : personName(s, k[0], forOthers)}`
}

export function BillCard({ bill: b, index = 0 }: { bill: AppBill; index?: number }) {
  const s = useAppState()
  const mine = b.shares[ME]
  const n = b.comments.filter((c) => !c.sys).length
  return (
    <Link className="card tap rise" style={{ display: 'block', ['--i' as string]: index }} to={`/bill/${b.id}`}>
      <div className="row">
        <div className="grow">
          <b>{b.title}</b>
          <div className="mute">{whenLabel(b.ts, b.date)} · {paidText(s, b)}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <b>{fmt(b.total)}</b>
          <div className="mute">{mine ? `your share ${fmt(mine)}` : 'not in this one'}</div>
        </div>
      </div>
      {n > 0 && <div className="mute" style={{ marginTop: 4 }}>💬 {n} comment{n > 1 ? 's' : ''}</div>}
    </Link>
  )
}

export function PayCard({ payment: p, index = 0 }: { payment: MergedPayment; index?: number }) {
  const s = useAppState()
  const sheet = useSheet()
  const open = () => sheet.open('Payment', (close) => <PaymentSheet p={p} close={close} />)
  const places = p.parts.length > 1 ? p.parts.map((x) => `${fmt(x.amt)} ${ledgerName(s, ledgerById(s, x.ledgerId) ?? ({ kind: 'group', name: 'a split' } as never))}`).join(' · ') : ''
  return (
    <div className="card row tap rise" style={{ ['--i' as string]: index }} role="button" tabIndex={0} onClick={open} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open())}>
      <Bullet letter="$" color="#00933C" size={36} />
      <div className="grow">
        <b>{personName(s, p.from)} paid {personName(s, p.to)}</b>
        <div className="mute">
          Payment · {whenLabel(p.ts, p.date, { exact: true })}
          {p.img && <span role="img" aria-label="Screenshot attached"> · 📎</span>}
        </div>
        {places && <div className="mute" style={{ fontSize: 12 }}>Applied: {places}</div>}
        {/* one line only; the whole note is in the sheet that opens when you tap the payment */}
        {p.note && <div className="oneline" style={{ marginTop: 4 }}>“{p.note}”</div>}
      </div>
      <b>{fmt(p.amt)}</b>
    </div>
  )
}

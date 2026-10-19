import { Link } from 'react-router-dom'
import { useAppState } from '../data/store'
import { personName } from '../domain/selectors'
import type { AppBill, AppPayment } from '../domain/types'
import { ME } from '../domain/types'
import { fmt } from '../domain/util'
import { paidMap } from '../money'
import { Bullet } from './bits'

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
          <div className="mute">{b.date} · {paidText(s, b)}</div>
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

export function PayCard({ payment: p, index = 0, onImage }: { payment: AppPayment; index?: number; onImage?: (p: AppPayment) => void }) {
  const s = useAppState()
  return (
    <div className="card row rise" style={{ ['--i' as string]: index }}>
      <Bullet letter="$" color="#00933C" size={36} />
      <div className="grow">
        <b>{personName(s, p.from)} paid {personName(s, p.to)}</b>
        <div className="mute">Payment · {p.date}</div>
        {p.note && <div style={{ marginTop: 4 }}>“{p.note}”</div>}
      </div>
      {p.img && (
        <img className="thumb" src={p.img} alt="Payment proof" role="button" tabIndex={0} onClick={() => onImage?.(p)} onKeyDown={(e) => e.key === 'Enter' && onImage?.(p)} />
      )}
      <b>{fmt(p.amt)}</b>
    </div>
  )
}

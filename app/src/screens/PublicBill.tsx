import { Navigate, useParams } from 'react-router-dom'
import { Screen } from '../app/Screen'
import { useAppState } from '../data/store'
import { findBill } from '../domain/selectors'
import { dayLabel } from '../domain/util'
import { useMoney } from '../ui/useMoney'
import { calc } from '../money'
import { Bullet } from '../ui/bits'
import { BillBreakdown, receiptNote } from '../ui/BillBreakdown'
import { paidText } from '../ui/BillCards'
import type { AppBill } from '../domain/types'
import { useToast } from '../ui/Toast'

/** What a friend sees from the share link: this bill only, with no balances, groups, tags or comments. */
export function PublicBill({ bill: given, onGet }: { bill?: AppBill; onGet?: () => void }) {
  const { id = '' } = useParams()
  const s = useAppState()
  const toast = useToast()
  const fmt = useMoney()
  const f = given ? { bill: given } : findBill(s, id)
  if (!f) return <Navigate to="/groups" replace />
  const b = f.bill
  const c = calc(b)
  const rn = receiptNote(b, fmt)
  return (
    <Screen id="v-public">
      <div className="vhead">
        <div className="row" style={{ margin: '6px 0 10px' }}>
          <Bullet letter="S" color="#FCCC0A" size={32} />
          <b>SplitThatBill</b>
          <span className="pill">shared bill</span>
        </div>
        <div className="pub" style={{ marginBottom: 8 }}>
          <div className="gname" style={{ fontSize: 28, lineHeight: 1.05 }}>{b.title}</div>
          <div className="mute">{dayLabel(b.date)}{b.loc ? ` · 📍 ${b.loc}` : ''} · {paidText(s, b, true)}</div>
          <div className="row" style={{ marginTop: 8 }}>
            <div className="grow mute">Total</div>
            <b style={{ fontSize: 26, letterSpacing: '-.04em' }}>{fmt(c.total)}</b>
          </div>
          {rn && <div className="mute">{rn}</div>}
        </div>
      </div>
      <div className="vbody">
        {b.notes && <div className="card" style={{ display: 'block' }}><div className="mute">Notes</div>{b.notes}</div>}
        <BillBreakdown bill={b} forOthers />
        <div className="bar info" style={{ marginTop: 16 }}>This page shows only this bill and how it was split. Get the app to track what you owe.</div>
        <button className="primary" onClick={() => (onGet ? onGet() : toast('The app is not on a store yet. Open the website to use it.'))}>Get SplitThatBill</button>
      </div>
    </Screen>
  )
}


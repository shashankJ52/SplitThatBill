import { useState } from 'react'
import * as A from '../data/actions'
import { useAppState, useStore } from '../data/store'
import { billWithCredit } from '../domain/draft'
import { findBill } from '../domain/selectors'
import { ME } from '../domain/types'
import { parseMoney, uid } from '../domain/util'
import { creditLines } from '../money'
import { Seg } from '../ui/bits'
import { useMoney } from '../ui/useMoney'
import { useToast } from '../ui/Toast'

/**
 * Add one more discount to a bill that is already saved: a cashback, a coupon, money back from the restaurant. The receipt
 * stays as printed; what each person owes comes down in proportion, and the bill's history says what was added.
 */
export function CreditSheet({ billId, close }: { billId: string; close: () => void }) {
  const s = useAppState()
  const store = useStore()
  const toast = useToast()
  const f = findBill(s, billId)
  const fmt = useMoney(f?.ledger)
  const [name, setName] = useState('Cashback')
  const [m, setM] = useState<'pct' | 'amt'>('pct')
  const [text, setText] = useState('')
  const [bad, setBad] = useState(false)
  if (!f) return <p className="mute">This bill is not available.</p>

  const t = text.trim()
  const v = !t ? null : m === 'amt' ? parseMoney(t) : /^\d{1,3}(\.\d{1,2})?$/.test(t) ? parseFloat(t) : null
  const valid = v !== null && v > 0 && (m === 'amt' || v <= 100)
  const label = name.trim().slice(0, 24) || 'Discount'
  const note = { id: uid('c'), by: ME, text: '', ts: Date.now(), sys: true }
  const preview = valid ? billWithCredit(f.bill, f.ledger, { name: label, m, v: v as number }, note) : null
  const taken = preview ? (creditLines(preview).at(-1)?.amt ?? 0) : 0

  const save = () => {
    if (!preview || !taken) {
      setBad(true)
      return toast(m === 'amt' ? 'Enter a valid amount' : 'Enter a percent between 0.01 and 100')
    }
    const saved = { ...preview, comments: [...preview.comments.slice(0, -1), { ...note, text: `You added a discount: ${label} −${fmt(taken)}` }] }
    store.update((st) => A.replaceBill(st, saved))
    close()
    toast(`${label} −${fmt(taken)} added`)
  }

  return (
    <>
      <p className="mute">A cashback, coupon or refund that came after the bill was split. It comes off what each person owes, in proportion to what they had. The receipt itself is not changed.</p>
      <label className="f" htmlFor="cr-name">What is it?</label>
      <input id="cr-name" maxLength={24} value={name} placeholder="e.g. Cashback" onChange={(e) => setName(e.target.value)} />
      <label className="f">How much?</label>
      <div className="row">
        <Seg className="dm" label="Discount type" value={m} options={[{ value: 'pct', label: '%' }, { value: 'amt', label: '$' }]} onChange={(x) => { setM(x); setText(''); setBad(false) }} />
        <input
          className={`price${bad ? ' bad' : ''}`}
          style={{ flex: 1 }}
          inputMode="decimal"
          aria-label="Discount value"
          placeholder={m === 'pct' ? 'Percent of the receipt, e.g. 40' : 'Amount, e.g. 12.50'}
          value={text}
          onChange={(e) => { setText(e.target.value); setBad(false) }}
          onKeyDown={(e) => e.key === 'Enter' && save()}
        />
      </div>
      {preview && taken > 0 && (
        <div className="bar ok" style={{ marginTop: 10 }}>
          Takes off {fmt(taken)}. The bill goes from {fmt(f.bill.total)} to {fmt(preview.total)}.
        </div>
      )}
      <div style={{ height: 12 }} />
      <button className="primary" disabled={!valid} onClick={save}>Add discount</button>
      <div style={{ height: 10 }} />
      <button className="secondary" onClick={close}>Cancel</button>
    </>
  )
}

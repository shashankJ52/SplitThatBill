import { useState } from 'react'
import { useDraftMoney } from '../flow/useDraftMoney'
import * as D from '../domain/draft'
import { personName } from '../domain/selectors'
import { allocCents } from '../money'
import { useAppState } from '../data/store'
import { Avatar, Seg, Stepper } from '../ui/bits'
import { MoneyField } from '../ui/MoneyField'
import { useToast } from '../ui/Toast'

/** Split the whole receipt without going item by item: equally (with guests) or by exact amounts. */
export function WholeSheet({ d, apply, close }: { d: D.Draft; apply: (next: D.Draft) => void; close: () => void }) {
  const fmt = useDraftMoney(d)
  const s = useAppState()
  const toast = useToast()
  const [w, setW] = useState<D.WholeSplit>(() => D.wholeFromDraft(d))
  const n = w.sel.length
  const tot = d.rt
  const sum = w.sel.reduce((a, p) => a + (w.amt[p] || 0), 0)
  const left = tot - sum
  const name = (p: string) => personName(s, p)

  const toggle = (p: string) => setW((x) => ({ ...x, sel: x.sel.includes(p) ? x.sel.filter((y) => y !== p) : [...x.sel, p] }))
  const guest = (p: string, dir: 1 | -1) => setW((x) => ({ ...x, g: { ...x.g, [p]: Math.max(0, Math.min(9, (x.g[p] || 0) + dir)) } }))

  let weights: Record<string, number> = {}
  let shares = 0
  let guests = 0
  if (w.mode === 'eq' && n) {
    w.sel.forEach((p) => {
      const g = w.g[p] || 0
      weights[p] = 1 + g
      shares += 1 + g
      guests += g
    })
    weights = allocCents(tot, weights)
  }
  const valid = w.mode === 'eq' ? n > 0 : n > 0 && left === 0

  const go = () => {
    const r = D.applyWhole(d, w)
    if (r.err) return toast(r.err)
    apply(r.d)
    close()
    toast(w.mode === 'eq' ? `Split equally: ${shares} share${shares === 1 ? '' : 's'} between ${n} ${n === 1 ? 'person' : 'people'}` : 'Custom amounts applied')
  }

  return (
    <>
      <p className="mute">Skip item by item. Choose who was there and how to split the receipt.</p>
      <Seg label="How to split" value={w.mode} options={[{ value: 'eq', label: 'Equally' }, { value: 'amt', label: 'By amount' }]} onChange={(m) => setW((x) => ({ ...x, mode: m }))} />
      <div className="chips">
        {d.people.map((p) => (
          <button key={p} className={`chip${w.sel.includes(p) ? ' on' : ''}`} aria-pressed={w.sel.includes(p)} onClick={() => toggle(p)}>
            {name(p)}
          </button>
        ))}
      </div>
      {w.mode === 'eq' ? (
        !n ? (
          <div className="bar bad">Pick at least one person</div>
        ) : (
          <>
            <div className="mute" style={{ marginBottom: 4 }}>Tap + if someone brought a guest. James +1 counts as 2 people.</div>
            {w.sel.map((p) => {
              const g = w.g[p] || 0
              return (
                <div className="row" style={{ padding: '5px 0' }} key={p}>
                  <Avatar pid={p} size={30} />
                  <div className="grow">
                    <b>{name(p)}</b>
                    <div className="mute">{g ? `counts as ${g + 1} people` : '1 person'} · pays {fmt(weights[p] || 0)}</div>
                  </div>
                  <Stepper value={`+${g}`} label={`guests for ${name(p)}`} onMinus={() => guest(p, -1)} onPlus={() => guest(p, 1)} />
                </div>
              )
            })}
            <div className="bar info" style={{ marginTop: 8 }}>
              {shares} share{shares === 1 ? '' : 's'} ({n} {n === 1 ? 'person' : 'people'}
              {guests ? ` + ${guests} guest${guests === 1 ? '' : 's'}` : ''}) · about {fmt(Math.round(tot / shares))} per share of the {fmt(tot)} receipt.
            </div>
          </>
        )
      ) : (
        <>
          {w.sel.map((p) => (
            <div className="row" style={{ padding: '4px 0' }} key={p}>
              <Avatar pid={p} size={30} />
              <div className="grow"><b>{name(p)}</b></div>
              <button className="linkbtn" onClick={() => setW((x) => ({ ...x, amt: { ...x.amt, [p]: Math.max(0, left + (x.amt[p] || 0)) } }))}>Rest</button>
              <MoneyField cents={w.amt[p] || 0} label={`Amount ${name(p)} pays`} onCommit={(c) => setW((x) => ({ ...x, amt: { ...x.amt, [p]: c } }))} message="Enter a valid amount" />
            </div>
          ))}
          <div className={`bar ${n && left === 0 ? 'ok' : 'bad'}`} style={{ marginTop: 8 }}>
            {!n ? 'Pick at least one person' : left === 0 ? `✓ Adds up to the receipt total ${fmt(tot)}` : left > 0 ? `${fmt(left)} of ${fmt(tot)} still to assign` : `${fmt(-left)} over the receipt total`}
          </div>
        </>
      )}
      <div style={{ height: 12 }} />
      <button className="primary" disabled={!valid} onClick={go}>Apply split</button>
      {d.fixed && (
        <>
          <div style={{ height: 10 }} />
          <button className="secondary" onClick={() => { apply(D.clearWhole(d)); close(); toast('Custom amounts removed') }}>Remove custom amounts</button>
        </>
      )}
    </>
  )
}

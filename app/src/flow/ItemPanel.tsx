import { itemWeights, type Item } from '../money'
import * as D from '../domain/draft'
import { personName } from '../domain/selectors'
import { fmt, pf } from '../domain/util'
import { useAppState } from '../data/store'
import { Avatar, Seg, Stepper } from '../ui/bits'

/** The "Price is for all or each" switch shown when the quantity is above one. */
export function PriceSeg({ it, onChange }: { it: Item; onChange: (m: 'total' | 'each') => void }) {
  const each = it.pe === 'each'
  return (
    <>
      <Seg
        className="pe"
        label="What the price means"
        value={each ? 'each' : 'total'}
        options={[{ value: 'total', label: `Total for all ${it.qty}` }, { value: 'each', label: 'Each' }]}
        onChange={onChange}
      />
      {each && <div className="mute" style={{ margin: '-4px 0 10px' }}>{fmt(it.price)} for all {it.qty}</div>}
    </>
  )
}

/** Who split this item: evenly between chosen people, or in portions that add up to the quantity. */
export function ItemPanel({ d, it, set }: { d: D.Draft; it: Item; set: (fn: (d: D.Draft) => D.Draft) => void }) {
  const s = useAppState()
  const a = it.a
  const name = (p: string) => personName(s, p)
  return (
    <div className="panel">
      <Seg
        label="How to split"
        value={a.mode}
        options={[{ value: 'even', label: 'Even' }, { value: 'por', label: 'Portions' }]}
        onChange={(m) => set((x) => D.setItemMode(x, it.id, m))}
      />
      {a.mode === 'even' ? (
        <>
          <div className="chips" style={{ marginTop: 0 }}>
            {d.people.map((p) => {
              const g = d.guests[p] || 0
              return (
                <button key={p} type="button" className={`chip${a.even.includes(p) ? ' on' : ''}`} aria-pressed={a.even.includes(p)} onClick={() => set((x) => D.toggleEven(x, it.id, p))}>
                  {name(p)}
                  {g ? ` +${g}` : ''}
                </button>
              )
            })}
          </div>
          <div className="mute">Everyone selected pays an equal share. Guests (+1s) count as extra shares.</div>
        </>
      ) : (
        <Portions d={d} it={it} set={set} />
      )}
    </div>
  )
}

function Portions({ d, it, set }: { d: D.Draft; it: Item; set: (fn: (d: D.Draft) => D.Draft) => void }) {
  const s = useAppState()
  const left = Math.round((it.qty - D.porSum(it)) * 100) / 100
  return (
    <>
      {d.people.map((p) => {
        const v = it.a.por[p] || 0
        return (
          <div key={p} className="row" style={{ padding: '5px 0' }}>
            <Avatar pid={p} size={30} />
            <div className="grow">
              <b>{personName(s, p)}</b>
              <div className="mute">{v > 0 ? fmt(Math.round((it.price * v) / it.qty)) : '—'}</div>
            </div>
            <Stepper
              value={pf(v)}
              label={`${it.name} for ${personName(s, p)}`}
              onMinus={() => set((x) => D.porStep(x, it.id, p, -1))}
              onPlus={() => set((x) => D.porStep(x, it.id, p, 1))}
            />
          </div>
        )
      })}
      <div className={`bar ${left === 0 ? 'ok' : 'bad'}`} style={{ margin: '10px 0 0' }}>
        {left === 0 ? `✓ All ${pf(it.qty)} portions assigned` : left > 0 ? `${pf(left)} of ${pf(it.qty)} portions still unassigned` : `${pf(-left)} too many portions`} · steps of {D.porStepOf(it)}
      </div>
    </>
  )
}

/** One line of text saying who has the item. */
export function assignText(d: D.Draft, it: Item, name: (p: string) => string): string {
  const a = it.a
  if (a.mode === 'even') return a.even.length ? a.even.map((p) => name(p) + (d.guests[p] ? ` +${d.guests[p]}` : '')).join(', ') : 'Unassigned'
  const k = Object.keys(a.por).filter((p) => a.por[p] > 0)
  return k.length ? k.map((p) => `${name(p)} ${pf(a.por[p])}`).join(' · ') : 'Unassigned'
}
export const assigned = (d: D.Draft, it: Item) => !!itemWeights(d, it)

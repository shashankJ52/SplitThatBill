import { allocCents, calc, creditLines, creditsSum, discCents, extrasSum, itemWeights, paidMap, type Extra } from '../money'
import { useState } from 'react'
import { useAppState } from '../data/store'
import { personName } from '../domain/selectors'
import type { AppBill } from '../domain/types'
import { pf } from '../domain/util'
import type { AppLedger } from '../domain/types'
import { useMoney } from './useMoney'
import { Avatar, Seg } from './bits'
import { ChevronIcon } from './icons'

export function extraLabel(e: Extra, name: (p: string) => string): string {
  return e.split === 'prop' ? 'split in proportion to items' : e.split === 'even' ? 'split evenly between people with items' : `split between ${e.people.map(name).join(', ')}`
}

/** Items, tax, tip, discount, extras and who pays what. Used on the bill page and the public preview. */
export function BillBreakdown({ bill: b, ledger, forOthers = false }: { bill: AppBill; ledger?: AppLedger | null; forOthers?: boolean }) {
  const s = useAppState()
  const fmt = useMoney(ledger)
  const name = (p: string) => personName(s, p, forOthers)
  const c = calc(b)
  const pm = paidMap(b, c.total)
  const dc = discCents(b)
  const credits = creditLines(b).filter((l) => l.amt > 0)
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'item' | 'person'>('item')
  // who had which item: the same split, read by person
  const byPerson = b.fixed
    ? []
    : c.rows
        .map((r) => ({
          p: r.p,
          sub: r.sub,
          lines: b.items.flatMap((it) => {
            const w = itemWeights(b, it)
            if (!w || !(w[r.p] > 0)) return []
            const g = b.guests[r.p] ?? 0
            const lab = it.a.mode === 'por' ? `${pf(w[r.p])} ${w[r.p] === 1 ? 'portion' : 'portions'}` : g ? `+${g} guest${g > 1 ? 's' : ''}` : ''
            return [{ it, cents: allocCents(it.price, w)[r.p], lab }]
          }),
        }))
        .filter((x) => x.lines.length)
  const itemsTotal = b.items.reduce((a, i) => a + i.price, 0)
  return (
    <>
      {!b.fixed && (
        <>
          <h2 className="ifold-h">
            <button type="button" className="ifold" aria-expanded={open} aria-controls="bill-items" onClick={() => setOpen(!open)}>
              <span>Items</span>
              <span className="ifold-sum">{b.items.length} {b.items.length === 1 ? 'item' : 'items'} · {fmt(itemsTotal)}</span>
              <span className="chev" aria-hidden="true"><ChevronIcon up={open} /></span>
            </button>
          </h2>
          {open && (
            <div id="bill-items">
              <Seg label="Show items" className="s2" value={view} onChange={setView} options={[{ value: 'item', label: 'By item' }, { value: 'person', label: 'By person' }]} />
              {view === 'item' ? (
                b.items.map((it) => {
                  const w = itemWeights(b, it)
                  const parts = w ? allocCents(it.price, w) : {}
                  return (
                    <div className="card" key={it.id} style={{ display: 'block' }}>
                      <div className="row">
                        <div className="grow"><b>{it.qty > 1 ? `${it.qty}× ` : ''}{it.name}</b></div>
                        <b>{fmt(it.price)}</b>
                      </div>
                      <div className="lines" style={{ marginTop: 6 }}>
                        {w ? (
                          Object.keys(parts).map((p) => {
                            const g = b.guests[p] ?? 0
                            const lab = it.a.mode === 'por' ? `${pf(w[p])} ${w[p] === 1 ? 'portion' : 'portions'}` : g ? `+${g} guest${g > 1 ? 's' : ''}` : ''
                            return (
                              <div key={p}>
                                <span>{name(p)}{lab && <span className="mute"> · {lab}</span>}</span>
                                <span>{fmt(parts[p])}</span>
                              </div>
                            )
                          })
                        ) : (
                          <div className="mute">Not fully assigned</div>
                        )}
                      </div>
                    </div>
                  )
                })
              ) : (
                byPerson.map((x) => (
                  <div className="card" key={x.p} style={{ display: 'block' }}>
                    <div className="row">
                      <Avatar pid={x.p} size={28} />
                      <div className="grow"><b>{name(x.p)}</b></div>
                      <b>{fmt(x.sub)}</b>
                    </div>
                    <div className="lines" style={{ marginTop: 6 }}>
                      {x.lines.map(({ it, cents, lab }) => (
                        <div key={it.id}>
                          <span>{it.qty > 1 ? `${it.qty}× ` : ''}{it.name}{lab && <span className="mute"> · {lab}</span>}</span>
                          <span>{fmt(cents)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}
      {b.fixed && <div className="bar info">The whole bill was split by custom amounts, not item by item.</div>}
      {(b.tax > 0 || b.tip > 0 || dc > 0 || b.extras.length > 0 || credits.length > 0) && (
        <>
          <h2>Tax, tip, discounts and extras</h2>
          <div className="card lines" style={{ display: 'block' }}>
            {b.tax > 0 && <div><span>Tax <span className="mute">· in proportion</span></span><span>{fmt(b.tax)}</span></div>}
            {b.tip > 0 && <div><span>Tip <span className="mute">· in proportion</span></span><span>{fmt(b.tip)}</span></div>}
            {dc > 0 && <div><span>Discount <span className="mute">· in proportion</span></span><span>−{fmt(dc)}</span></div>}
            {b.extras.map((e) => (
              <div key={e.id}><span>{e.name} <span className="mute">· {extraLabel(e, name)}</span></span><span>{fmt(e.amt)}</span></div>
            ))}
            {credits.map((l) => (
              <div key={l.credit.id}><span>{l.credit.name} <span className="mute">· {l.credit.m === 'pct' ? `${l.credit.v}% off the receipt, ` : ''}in proportion</span></span><span>−{fmt(l.amt)}</span></div>
            ))}
          </div>
        </>
      )}
      <h2>Who pays what</h2>
      {c.rows.filter((r) => r.total > 0 || pm[r.p]).map((r) => {
        const g = b.guests[r.p] ?? 0
        return (
          <div className="card row" key={r.p}>
            <Avatar pid={r.p} size={32} />
            <div className="grow">
              <b>{name(r.p)}{g > 0 && <span className="pill">+{g}</span>}</b>
              {pm[r.p] && <> <span className="pill">paid {fmt(pm[r.p])}</span></>}
              <div className="mute">
                {b.fixed ? `Custom amount ${fmt(r.sub)}` : `Items ${fmt(r.sub)}${r.fee ? ` · tax & tip ${fmt(r.fee)}` : ''}${r.dc ? ` · discount −${fmt(r.dc)}` : ''}`}
                {r.ex ? ` · extras ${fmt(r.ex)}` : ''}
                {r.cr ? ` · extra discounts −${fmt(r.cr)}` : ''}
              </div>
              {r.total - (pm[r.p] ?? 0) !== 0 && (
                <div className={`stat ${r.total - (pm[r.p] ?? 0) > 0 ? 'r' : 'g'}`} style={{ textAlign: 'left', marginTop: 2 }}>
                  {r.total - (pm[r.p] ?? 0) > 0 ? `owes ${fmt(r.total - (pm[r.p] ?? 0))}` : `is owed ${fmt((pm[r.p] ?? 0) - r.total)}`}
                </div>
              )}
            </div>
            <div style={{ textAlign: 'right' }}>
              <b>{fmt(r.total)}</b>
              <div className="mute" style={{ fontSize: 12 }}>their share</div>
            </div>
          </div>
        )
      })}
    </>
  )
}

export const receiptNote = (b: AppBill, fmt: (cents: number) => string) => {
  const dc = discCents(b)
  const ex = extrasSum(b)
  const cr = creditsSum(b)
  return dc || ex || cr ? `Receipt ${fmt(b.rt)}${dc ? ` (after −${fmt(dc)} discount)` : ''}${ex ? ` + extras ${fmt(ex)}` : ''}${cr ? ` − extra discounts ${fmt(cr)}` : ''}` : ''
}

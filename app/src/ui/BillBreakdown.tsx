import { allocCents, calc, creditLines, creditsSum, discCents, extrasSum, itemWeights, paidMap, type Extra } from '../money'
import { useAppState } from '../data/store'
import { personName } from '../domain/selectors'
import type { AppBill } from '../domain/types'
import { pf } from '../domain/util'
import type { AppLedger } from '../domain/types'
import { useMoney } from './useMoney'
import { Avatar } from './bits'

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
  return (
    <>
      <h2>Items</h2>
      {b.items.map((it) => {
        const w = b.fixed ? null : itemWeights(b, it)
        const parts = w ? allocCents(it.price, w) : {}
        return (
          <div className="card" key={it.id} style={{ display: 'block' }}>
            <div className="row">
              <div className="grow"><b>{it.qty > 1 ? `${it.qty}× ` : ''}{it.name}</b></div>
              <b>{fmt(it.price)}</b>
            </div>
            {!b.fixed && (
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
            )}
          </div>
        )
      })}
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
            </div>
            <b>{fmt(r.total)}</b>
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

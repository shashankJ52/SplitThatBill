import { useRef, useState } from 'react'
import { useDraftMoney } from '../../flow/useDraftMoney'
import { useNavigate } from 'react-router-dom'
import { Screen } from '../../app/Screen'
import * as A from '../../data/actions'
import { useAppState, useStore } from '../../data/store'
import { CURRENCIES } from '../../domain/currency'
import { isAdmin } from '../../domain/membership'
import { CurrencyChip } from '../../ui/CurrencyChip'
import { useSheet } from '../../ui/Sheet'
import * as D from '../../domain/draft'
import { parseMoney } from '../../domain/util'
import { discCents, extrasSum, itemsSum, type Extra } from '../../money'
import { ItemPanel, PriceSeg } from '../../flow/ItemPanel'
import { useFlow } from '../../flow/FlowProvider'
import { withDraft } from '../../flow/withDraft'
import { ledgerById, ledgerName, oneLedger, personName } from '../../domain/selectors'
import { Bullet, Empty, Seg } from '../../ui/bits'
import { Dropdown } from '../../ui/Dropdown'
import { FlowFooter } from '../../ui/FlowFooter'
import { IntField, MoneyField } from '../../ui/MoneyField'
import { useToast } from '../../ui/Toast'

const SPLITS: { value: Extra['split']; label: string; letter: string; color: string }[] = [
  { value: 'even', label: 'Evenly between people with items', letter: 'E', color: '#0039A6' },
  { value: 'prop', label: 'In proportion to items', letter: 'P', color: '#FF6319' },
  { value: 'pick', label: 'Evenly between people I choose', letter: 'C', color: '#00933C' },
]

export const Review = withDraft(function Review({ d }: { d: D.Draft }) {
  const fmt = useDraftMoney(d)
  const { set } = useFlow()
  const nav = useNavigate()
  const toast = useToast()
  const s = useAppState()
  const store = useStore()
  const sheet = useSheet()
  const cur = D.draftCurrency(s, d)
  const ledger = d.ledgerId ? ledgerById(s, d.ledgerId) : d.kind === 'group' ? (d.gid ? ledgerById(s, d.gid) : undefined) : d.withP ? oneLedger(s, d.withP) : undefined
  /** A split is written in the currency of its group or 1-1, so changing it there changes that group (for everyone). */
  const pickCurrency = (code: string) => {
    if (code === cur) return
    if (!ledger) return set((x) => ({ ...x, currency: code }))
    if (!isAdmin(ledger)) return toast('Only an admin of this group can change its currency')
    sheet.open('Change currency?', (close) => (
      <>
        <p className="mute">
          {ledgerName(s, ledger)} is in {cur}. Changing it to {code} changes the symbol on every amount in it, for everyone. Nothing is converted.
        </p>
        <button className="primary" onClick={() => { store.update((st) => A.setLedgerCurrency(st, ledger.id, code)); close(); toast(`${ledgerName(s, ledger)} is now in ${code}`) }}>Change to {code}</button>
        <div style={{ height: 10 }} />
        <button className="secondary" onClick={close}>Keep {cur}</button>
      </>
    ))
  }
  const [open, setOpen] = useState<number | null>(null)
  const [qty, setQty] = useState('1')
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [bad, setBad] = useState<'qty' | 'price' | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const qtyRef = useRef<HTMLInputElement>(null)
  const priceRef = useRef<HTMLInputElement>(null)

  const q = Number(qty)
  const showMode = /^\d+$/.test(qty.trim()) && q > 1
  const typed = parseMoney(price)
  const dc = discCents(d)
  const sum = D.itemsPlusFees(d)
  const ok = D.reconciles(d)

  const add = () => {
    const r = D.addItem(d, { name, qty: /^\d+$/.test(qty.trim()) ? q : NaN, price: typed ?? 0, each: d.qm === 'each' })
    if (r.err) {
      toast(r.err)
      const isQty = r.err.startsWith('Quantity')
      setBad(isQty ? 'qty' : 'price')
      ;(isQty ? qtyRef : priceRef).current?.focus()
      return
    }
    set(() => r.d)
    setName('')
    setQty('1')
    setPrice('')
    setBad(null)
    nameRef.current?.focus()
  }
  const enter = (e: React.KeyboardEvent) => e.key === 'Enter' && (e.preventDefault(), add())

  return (
    <Screen id="v-review">
      <div className="vhead">
        <div className="titlerow">
          <h1 className="display">Review items</h1>
          <CurrencyChip value={cur} options={CURRENCIES.map((c) => c.code)} onPick={pickCurrency} label="Currency of this split" />
        </div>
        {!d.manual && (
          <div className={`bar ${ok ? 'ok' : 'bad'}`}>
            {ok ? (
              <>✓ Items + tax + tip{dc ? ' − discount' : ''} = {fmt(sum)} · matches receipt</>
            ) : (
              <>
                ⚠ Items + tax + tip{dc ? ' − discount' : ''} = {fmt(sum)}, receipt says {fmt(d.rt)} (off by {fmt(Math.abs(sum - d.rt))}). Fix an item or{' '}
                <button type="button" className="linkbtn" onClick={() => set(D.acceptSum)}>use {fmt(sum)}</button>
              </>
            )}
          </div>
        )}
        <div className="row" style={{ gap: 6, marginBottom: 8 }}>
          <input ref={qtyRef} className={`qty${bad === 'qty' ? ' bad' : ''}`} value={qty} inputMode="numeric" aria-label="Quantity" onChange={(e) => { setQty(e.target.value); setBad(null) }} onKeyDown={enter} />
          <input ref={nameRef} className="grow" placeholder="Item name" maxLength={60} aria-label="Item name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={enter} />
          <input ref={priceRef} className={`price${bad === 'price' ? ' bad' : ''}`} style={{ width: 84 }} placeholder="0.00" inputMode="decimal" aria-label="Price" value={price} onChange={(e) => { setPrice(e.target.value); setBad(null) }} onKeyDown={enter} />
          <button className="primary" style={{ width: 'auto', padding: '11px 16px' }} onClick={add}>Add</button>
        </div>
        {showMode && (
          <div id="qa-mode">
            <span className="mute" style={{ alignSelf: 'center', flex: 'none' }}>Price is for</span>
            <Seg
              className="qm"
              label="What the price means"
              value={d.qm}
              options={[{ value: 'total', label: `All ${q}` }, { value: 'each', label: 'Each' }]}
              onChange={(m) => { set((x) => ({ ...x, qm: m })); priceRef.current?.focus() }}
            />
            {typed !== null && typed > 0 && <span className="mute" style={{ alignSelf: 'center', flex: 'none', fontSize: 12 }}>= {fmt(d.qm === 'each' ? typed * q : typed)}</span>}
          </div>
        )}
      </div>
      <div className="vbody">
        <div id="items">
          {d.items.length ? (
            d.items.map((i) => {
              const isOpen = open === i.id
              return (
                <div className="card" key={i.id}>
                  <div className="row tap" role="button" tabIndex={0} aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : i.id)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setOpen(isOpen ? null : i.id))}>
                    <div className="grow">
                      <b>{i.qty > 1 ? `${i.qty}× ` : ''}{i.name || 'Unnamed'}</b>
                      {i.qty > 1 && <div className="mute">{fmt(Math.round(i.price / i.qty))} each</div>}
                    </div>
                    <b>{fmt(i.price)}</b>
                    <span className="mute">{isOpen ? '⌃' : '⌄'}</span>
                  </div>
                  {isOpen && (
                    <>
                      <div className="panel">
                        <div className="row" style={{ margin: '10px 0' }}>
                          <IntField value={i.qty} label="Quantity" message="Quantity must be 1–99" onCommit={(n) => { const r = D.setItemQty(d, i.id, n); if (r.err) toast(r.err); else set(() => r.d) }} />
                          <input className="grow" key={`${i.id}:${i.name}`} defaultValue={i.name} maxLength={60} aria-label="Item name" onBlur={(e) => e.target.value.trim() !== i.name && set((x) => D.setItemName(x, i.id, e.target.value))} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
                          <MoneyField cents={i.pe === 'each' ? (i.unit as number) : i.price} label={i.pe === 'each' ? 'Price each' : 'Total price'} onCommit={(c) => set((x) => D.setItemPrice(x, i.id, c))} />
                          <button className="del" aria-label="Delete item" onClick={() => { set((x) => D.removeItem(x, i.id)); setOpen(null) }}>✕</button>
                        </div>
                        {i.qty > 1 && (
                          <PriceSeg fmt={fmt} it={i} onChange={(m) => { const r = D.setItemPe(d, i.id, m); set(() => r.d); if (r.rounded !== undefined) toast(`Rounded to ${fmt(r.rounded)} each`) }} />
                        )}
                      </div>
                      <div className="mute">Who split it</div>
                      <ItemPanel d={d} it={i} set={set} />
                    </>
                  )}
                </div>
              )
            })
          ) : (
            <Empty small title="No items yet">Type an item above and tap Add.</Empty>
          )}
        </div>

        <div className="card" id="fees">
          {(['tax', 'tip'] as const).map((k) => (
            <div className="row" style={{ margin: '4px 0' }} key={k}>
              <div className="grow"><b>{k === 'tax' ? 'Tax' : 'Tip'}</b></div>
              <MoneyField cents={d[k]} label={k === 'tax' ? 'Tax' : 'Tip'} onCommit={(c) => set((x) => D.setFee(x, k, c))} />
            </div>
          ))}
          {d.disc ? (
            <div className="row" style={{ margin: '4px 0' }}>
              <div className="grow"><b>Discount</b><div className="mute">−{fmt(dc)}</div></div>
              <Seg
                className="dm"
                label="Discount type"
                value={d.disc.m}
                options={[{ value: 'amt', label: '$' }, { value: 'pct', label: '%' }]}
                onChange={(m) => set((x) => D.setDiscountMode(x, m))}
              />
              <input
                key={`${d.disc.m}:${d.disc.v}`}
                className="price"
                style={{ width: 78 }}
                inputMode="decimal"
                aria-label="Discount value"
                defaultValue={d.disc.m === 'amt' ? (d.disc.v / 100).toFixed(2) : d.disc.v}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                onBlur={(e) => {
                  const m = d.disc!.m
                  const t = e.target.value.trim()
                  const v = m === 'amt' ? parseMoney(t) : /^\d{1,3}(\.\d{1,2})?$/.test(t) ? parseFloat(t) : null
                  const r = v === null ? { d, err: m === 'amt' ? 'Enter a valid amount' : 'Enter a percent between 0.01 and 100' } : D.setDiscountValue(d, v)
                  if (r.err) { e.target.classList.add('bad'); toast(r.err); return }
                  e.target.classList.remove('bad')
                  set(() => r.d)
                  if (m === 'amt' && (v as number) > itemsSum(d.items) + d.tax + d.tip) toast('Discount capped at the bill total')
                }}
              />
              <button className="del" aria-label="Remove discount" onClick={() => set(D.removeDiscount)}>✕</button>
            </div>
          ) : (
            <button className="linkbtn" onClick={() => set(D.addDiscount)}>% Apply discount</button>
          )}
          <div className="row" style={{ margin: '4px 0' }}>
            <div className="grow"><b>{d.manual ? 'Total' : 'Receipt total'}</b></div>
            {d.manual ? <b>{fmt(d.rt)}</b> : <MoneyField cents={d.rt} label="Receipt total" onCommit={(c) => set((x) => D.setFee(x, 'rt', c))} />}
          </div>
        </div>

        <h2>Extras on the same day</h2>
        <div id="extras">
          {d.extras.length ? (
            d.extras.map((e) => (
              <div className="card" key={e.id}>
                <div className="row">
                  <input className="grow" defaultValue={e.name} maxLength={40} aria-label="Extra name" onBlur={(ev) => set((x) => D.patchExtra(x, e.id, { name: ev.target.value }))} />
                  <MoneyField cents={e.amt} label="Extra amount" onCommit={(c) => set((x) => D.patchExtra(x, e.id, { amt: c }))} />
                  <button className="del" aria-label="Delete extra" onClick={() => set((x) => D.removeExtra(x, e.id))}>✕</button>
                </div>
                <div style={{ marginTop: 8 }}>
                  <Dropdown
                    label="How to split"
                    value={e.split}
                    onChange={(v) => set((x) => D.patchExtra(x, e.id, { split: v }))}
                    options={SPLITS.map((o) => ({ value: o.value, label: o.label, icon: <Bullet letter={o.letter} color={o.color} size={28} /> }))}
                  />
                </div>
                {e.split === 'pick' && (
                  <>
                    <div className="chips">
                      {d.people.map((p) => (
                        <button key={p} className={`chip${e.people.includes(p) ? ' on' : ''}`} aria-pressed={e.people.includes(p)} onClick={() => set((x) => D.toggleExtraPerson(x, e.id, p))}>
                          {personName(s, p)}
                        </button>
                      ))}
                    </div>
                    {!e.people.length && <div className="mute">Pick at least one person, or it falls back to proportional.</div>}
                  </>
                )}
              </div>
            ))
          ) : (
            <Empty small title="">Cab, parking, a tip jar… anything from the same day.</Empty>
          )}
        </div>
        <button className="secondary" onClick={() => set(D.addExtra)}>+ Add extra (cab, parking…)</button>
        <div className="sign" style={{ marginTop: 14 }}>
          <div className="lbl" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#bdbdbd' }}>Grand total</div>
          <div className="num" style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-.04em' }}>{fmt(d.rt + extrasSum(d))}</div>
        </div>
      </div>
      <FlowFooter label="Continue" disabled={!D.canContinue(d, 'review')} onClick={() => nav('/scan/assign')} />
    </Screen>
  )
})

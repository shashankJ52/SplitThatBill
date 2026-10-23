import { Bullet } from '../ui/bits'

/** Small hand-built illustrations. They use the app's colors and theme variables, so they work in dark and light. */

const PEOPLE = [
  { l: 'A', c: '#0039A6' },
  { l: 'J', c: '#FF6319' },
  { l: 'P', c: '#00933C' },
  { l: 'S', c: '#B933AD' },
]
const person = (i: number, size = 22) => <Bullet key={i} letter={PEOPLE[i].l} color={PEOPLE[i].c} size={size} />

/** The hero: a receipt whose lines get matched to people one by one. */
export function ReceiptArt() {
  const rows: { n: string; p: string; who: number[] }[] = [
    { n: 'Caesar salad', p: '12.50', who: [0] },
    { n: 'Ribeye steak', p: '38.00', who: [1] },
    { n: 'Nachos to share', p: '14.00', who: [0, 1, 2, 3] },
    { n: 'Beer ×3', p: '18.00', who: [1, 2, 3] },
    { n: 'Tiramisu', p: '9.00', who: [2] },
  ]
  return (
    <div className="lp-hero-art" aria-hidden="true">
      <div className="lp-receipt">
        <div className="lp-r-head">TRATTORIA ROMA</div>
        <div className="lp-r-dash" />
        {rows.map((r, i) => (
          <div className="lp-r-row" key={r.n} style={{ ['--i' as string]: i }}>
            <span className="lp-r-name">{r.n}</span>
            <span className="lp-r-who">{r.who.map((w) => person(w, 20))}</span>
            <span className="lp-r-price">{r.p}</span>
          </div>
        ))}
        <div className="lp-r-dash" />
        <div className="lp-r-row lp-r-total"><span className="lp-r-name">Total</span><span /><span className="lp-r-price">$91.50</span></div>
      </div>
      <div className="lp-owes">
        <div className="lp-owes-row" style={{ ['--i' as string]: 0 }}>{person(1, 26)}<span>Jamie owes <b>$31.25</b></span></div>
        <div className="lp-owes-row" style={{ ['--i' as string]: 1 }}>{person(3, 26)}<span>Sam owes <b>$15.38</b></span></div>
      </div>
    </div>
  )
}

/** Step 1: a phone looking at a receipt. */
export function ScanArt() {
  return (
    <div className="lp-art lp-scan" aria-hidden="true">
      <div className="lp-scan-paper">
        {[70, 90, 55, 80, 65].map((w, i) => <span key={i} style={{ width: `${w}%` }} />)}
        <i className="lp-scan-bar" />
      </div>
      <b className="lp-corner tl" /><b className="lp-corner tr" /><b className="lp-corner bl" /><b className="lp-corner br" />
    </div>
  )
}

/** Step 2: items with the people who share them. */
export function AssignArt() {
  const rows = [
    { n: 'Ribeye steak', p: '$38.00', who: [1] },
    { n: 'Nachos', p: '$14.00', who: [0, 1, 2] },
    { n: 'Beer', p: '$18.00', who: [1, 3] },
  ]
  return (
    <div className="lp-art lp-assign" aria-hidden="true">
      {rows.map((r) => (
        <div className="lp-a-row" key={r.n}>
          <div className="lp-a-name"><b>{r.n}</b><span className="mute">{r.p}</span></div>
          <div className="lp-a-who">{PEOPLE.map((_, i) => <span key={i} className={r.who.includes(i) ? 'on' : ''}>{person(i, 24)}</span>)}</div>
        </div>
      ))}
      <div className="lp-chip">Jamie +1 counts as 2 people</div>
    </div>
  )
}

/** Step 3: balances. */
export function OweArt() {
  return (
    <div className="lp-art lp-owe" aria-hidden="true">
      <div className="lp-o-row">{person(0, 30)}<div className="grow"><b>Alex</b><div className="mute">Euro trip · €</div></div><span className="lp-g">owes you €42.00</span></div>
      <div className="lp-o-row">{person(2, 30)}<div className="grow"><b>Priya</b><div className="mute">Flat · $</div></div><span className="lp-g">owes you $38.20</span></div>
      <div className="lp-o-row">{person(3, 30)}<div className="grow"><b>Sam</b><div className="mute">1-1 · $</div></div><span className="lp-r">you owe $12.00</span></div>
    </div>
  )
}

/** Step 4: a message and a link. */
export function ShareArt() {
  return (
    <div className="lp-art lp-share" aria-hidden="true">
      <div className="lp-bubble">
        <b>🧾 Trattoria Roma</b>
        <div>Total $91.50 · paid by Alex</div>
        <div>• Jamie owes $31.25</div>
        <div>• Sam owes $15.38</div>
        <div className="lp-link">See the full split: splitthatbill.app/b/k3Zp…</div>
      </div>
      <div className="lp-chip">Copy · WhatsApp · open in any browser</div>
    </div>
  )
}

/** Step 5: a payment recorded. */
export function SettleArt() {
  return (
    <div className="lp-art lp-settle" aria-hidden="true">
      <div className="lp-pay">
        <Bullet letter="$" color="#00933C" size={36} />
        <div className="grow"><b>Sam paid Alex</b><div className="mute">Payment · “Zelle ref 4821” · 📎</div></div>
        <b>$12.00</b>
      </div>
      <div className="lp-pill-ok">✓ Settled up</div>
      <div className="lp-chip">🔔 Friendly reminders for the slow payers</div>
    </div>
  )
}

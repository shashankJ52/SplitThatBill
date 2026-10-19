import { useState } from 'react'
import { calc, type BillInput } from './money'
import './App.css'

// Placeholder screen that proves the design tokens and the money engine are wired up.
// The real screens are rebuilt from the wireframe in the next step.
const people = [
  { id: 'me', name: 'You', color: '#ff6319', ink: '#fff' },
  { id: 'james', name: 'James', color: '#996633', ink: '#fff' },
  { id: 'priya', name: 'Priya', color: '#fccc0a', ink: '#000' },
]

const sample: BillInput = {
  people: people.map((p) => p.id),
  items: [
    { id: 1, name: 'Nachos', qty: 1, price: 1400, a: { mode: 'even', even: ['me', 'james', 'priya'], por: {} } },
    { id: 2, name: 'Cola (4)', qty: 4, price: 1200, a: { mode: 'por', even: [], por: { me: 0.5, james: 2.5, priya: 1 } } },
  ],
  tax: 208, tip: 520, disc: null, rt: 3328, extras: [], guests: {}, payer: 'me', paid: null, fixed: null,
}

const money = (c: number) => `$${(c / 100).toFixed(2)}`

export default function App() {
  const [theme, setTheme] = useState(document.documentElement.dataset.theme ?? 'dark')
  const result = calc(sample)

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    try { localStorage.setItem('stb-theme', next) } catch { /* storage can be blocked */ }
    setTheme(next)
  }

  return (
    <main className="app">
      <div className="top">
        <div className="brand">
          <span className="bullet" style={{ '--c': '#fccc0a', '--t': '#000', '--s': '40px' } as React.CSSProperties}>S</span>
          SplitThatBill
        </div>
        <button className="theme" onClick={toggle} aria-label="Toggle light or dark mode">◐</button>
      </div>
      <h1>Phase 1</h1>
      <p className="sub">Foundation is live: design tokens, installable shell and the money engine.</p>
      <div className="sign">
        <div className="lbl">Sample bill total</div>
        <div className="num">{money(result.total)}</div>
      </div>
      <div className="rows">
        {result.rows.map((r) => {
          const p = people.find((x) => x.id === r.p)!
          return (
            <div className="card" key={r.p}>
              <span className="bullet" style={{ '--c': p.color, '--t': p.ink, '--s': '36px' } as React.CSSProperties}>{p.name[0]}</span>
              <div className="grow"><b>{p.name}</b><div className="mute">items {money(r.sub)} + tax and tip {money(r.fee)}</div></div>
              <b>{money(r.total)}</b>
            </div>
          )
        })}
      </div>
      <p className="mute foot">Sum of shares: {money(result.rows.reduce((a, r) => a + r.total, 0))}</p>
    </main>
  )
}

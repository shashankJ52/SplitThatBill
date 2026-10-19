import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Screen } from '../../app/Screen'
import * as A from '../../data/actions'
import { useStore } from '../../data/store'
import { Bullet } from '../../ui/bits'

const SLIDES = [
  { c: '#FF6319', l: '1', t: 'Scan the receipt', d: 'Snap a bill or type the items in. Card numbers are hidden for you.' },
  { c: '#00933C', l: '2', t: 'Split item by item', d: 'Shared nachos, 2.5 colas, a friend plus one. Every item can be split its own way.' },
  { c: '#0039A6', l: '3', t: 'Settle up', d: 'See who owes whom across every group, send a friendly reminder, record payments.' },
]

export function Welcome() {
  const nav = useNavigate()
  const store = useStore()
  const [i, setI] = useState(0)
  const x0 = useRef<number | null>(null)
  const s = SLIDES[i]
  const skip = () => {
    // exploring the demo means using the sample account
    if (!store.get().signedIn) store.update(A.signIn)
    nav('/groups', { replace: true, state: { anim: 'fade' } })
  }
  return (
    <Screen id="v-welcome">
      <div className="vhead">
        <div className="row" style={{ margin: '8px 0 0' }}>
          <Bullet letter="S" color="#FCCC0A" size={44} />
          <b style={{ fontSize: 22, letterSpacing: '-.03em' }}>SplitThatBill</b>
        </div>
      </div>
      <div className="vbody">
        <div
          aria-live="polite"
          style={{ marginTop: 28, minHeight: 250, touchAction: 'pan-y' }}
          onPointerDown={(e) => (x0.current = e.clientX)}
          onPointerUp={(e) => {
            if (x0.current === null) return
            const dx = e.clientX - x0.current
            x0.current = null
            if (Math.abs(dx) > 50) setI((n) => Math.max(0, Math.min(SLIDES.length - 1, n + (dx < 0 ? 1 : -1))))
          }}
        >
          <Bullet letter={s.l} color={s.c} size={96} />
          <h1 className="display" style={{ fontSize: 38, margin: '18px 0 8px' }}>{s.t}</h1>
          <p className="sub" style={{ fontSize: 17 }}>{s.d}</p>
        </div>
        <div className="dots" role="group" aria-label="Intro slides">
          {SLIDES.map((_, n) => <button key={n} className={`dotb${n === i ? ' on' : ''}`} onClick={() => setI(n)} aria-label={`Slide ${n + 1} of 3`} aria-current={n === i} />)}
        </div>
        <div style={{ height: 18 }} />
        <button className="primary" onClick={() => nav('/signup')}>Create account</button>
        <div style={{ height: 10 }} />
        <button className="secondary" onClick={() => nav('/login')}>Log in</button>
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <button className="linkbtn" onClick={skip}>Skip and explore the demo</button>
        </div>
      </div>
    </Screen>
  )
}

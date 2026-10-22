import { useEffect, useRef, useState } from 'react'
import { Bullet } from './bits'

/** The five stops, in a line or two each. Shown on the log in and sign up screens. */
const STEPS = [
  { c: '#FF6319', l: '1', t: 'Scan the receipt', d: 'Snap a bill or type the items in. Card numbers and names are left out.' },
  { c: '#00933C', l: '2', t: 'Say who had what', d: 'Split every item its own way: evenly, in portions, with a friend plus one.' },
  { c: '#0039A6', l: '3', t: 'See who owes whom', d: 'Balances for every group and person, each currency kept on its own.' },
  { c: '#FCCC0A', l: '4', t: 'Share it', d: 'Send a WhatsApp message or a link anyone can open.' },
  { c: '#EE352E', l: '5', t: 'Settle up', d: 'Record payments, add a note or screenshot, and send friendly reminders.' },
]

/** A swipeable intro that moves on by itself (unless motion is turned down) and stops once someone touches it. */
export function StepsCarousel() {
  const [i, setI] = useState(0)
  const x0 = useRef<number | null>(null)
  const touched = useRef(false)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const id = setInterval(() => {
      if (!touched.current) setI((n) => (n + 1) % STEPS.length)
    }, 4500)
    return () => clearInterval(id)
  }, [])

  const go = (n: number) => {
    touched.current = true
    setI((n + STEPS.length) % STEPS.length)
  }
  const s = STEPS[i]
  return (
    <div className="steps" role="group" aria-roledescription="carousel" aria-label="How SplitThatBill works">
      <div
        className="steps-slide"
        aria-live="off"
        style={{ touchAction: 'pan-y' }}
        onPointerDown={(e) => (x0.current = e.clientX)}
        onPointerUp={(e) => {
          if (x0.current === null) return
          const dx = e.clientX - x0.current
          x0.current = null
          if (Math.abs(dx) > 40) go(i + (dx < 0 ? 1 : -1))
        }}
      >
        <div key={i} className="steps-in">
          <Bullet letter={s.l} color={s.c} size={56} />
          <div className="steps-text">
            <div className="steps-label">Stop {s.l} of {STEPS.length}</div>
            <h2>{s.t}</h2>
            <p>{s.d}</p>
          </div>
        </div>
      </div>
      <div className="dots" role="group" aria-label="Steps">
        {STEPS.map((x, n) => <button key={x.t} className={`dotb${n === i ? ' on' : ''}`} onClick={() => go(n)} aria-label={`Step ${n + 1}: ${x.t}`} aria-current={n === i} />)}
      </div>
    </div>
  )
}

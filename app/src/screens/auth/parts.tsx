import { useState } from 'react'
import { PW_LABELS, pwScore } from '../../domain/auth'
import { useToast } from '../../ui/Toast'

export function PwField({ id, label, value, onChange, auto, first }: { id: string; label: string; value: string; onChange: (v: string) => void; auto: string; first?: boolean }) {
  const [show, setShow] = useState(false)
  return (
    <>
      <label className="f" htmlFor={id} style={first ? { marginTop: 0 } : undefined}>{label}</label>
      <div className="pw">
        <input id={id} type={show ? 'text' : 'password'} autoComplete={auto} value={value} onChange={(e) => onChange(e.target.value)} />
        <button type="button" className="eye" onClick={() => setShow((x) => !x)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? 'Hide' : 'Show'}</button>
      </div>
    </>
  )
}

const COLS = ['#EE352E', '#FF6319', '#FCCC0A', '#00933C']
export function Meter({ value }: { value: string }) {
  const s = value ? pwScore(value) : 0
  return (
    <div>
      <div className="meter" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => <i key={i} style={{ background: i < s ? COLS[Math.max(0, s - 1)] : 'var(--line)' }} />)}
      </div>
      <div className="mute" style={{ fontSize: 12 }} aria-live="polite">{value ? PW_LABELS[s] : 'At least 8 characters with a number'}</div>
    </div>
  )
}

export function ErrBar({ msg, style }: { msg: string; style?: React.CSSProperties }) {
  return msg ? <div className="bar bad" role="alert" style={style}>{msg}</div> : null
}

/** Apple and Google are placeholders until the backend can handle them. */
export function Social() {
  const toast = useToast()
  return (
    <>
      <div className="sep">or</div>
      <button className="secondary" onClick={() => toast('Apple sign-in is not connected yet')}>Continue with Apple</button>
      <div style={{ height: 10 }} />
      <button className="secondary" onClick={() => toast('Google sign-in is not connected yet')}>Continue with Google</button>
    </>
  )
}

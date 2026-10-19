import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Screen } from '../../app/Screen'
import * as A from '../../data/actions'
import { useStore } from '../../data/store'
import { checkCode, DEMO_CODE, maskEmail } from '../../domain/auth'
import { useToast } from '../../ui/Toast'
import { useUiState } from '../../ui/uiState'
import { ErrBar } from './parts'
import type { PendingSignup } from './Signup'

const COOL = 10

export function Verify() {
  const nav = useNavigate()
  const store = useStore()
  const toast = useToast()
  const [pending, setPending] = useUiState<PendingSignup | null>('auth.su', null)
  const [code, setCode] = useState('')
  const [tries, setTries] = useState(0)
  const [err, setErr] = useState('')
  const [cool, setCool] = useState(COOL)
  // once verified the pending signup is cleared; that must not bounce the page back to sign up
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (cool <= 0) return
    const t = setTimeout(() => setCool((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cool])

  if (!pending) return done ? null : <Navigate to="/signup" replace />
  const first = pending.name.split(' ')[0]

  const submit = () => {
    const r = checkCode(tries, code)
    setTries(r.tries)
    if (!r.ok) return setErr(r.msg ?? '')
    store.update(() => A.createAccount({ name: pending.name, email: pending.email, tag: pending.tag }, pending.pw))
    setDone(true)
    setPending(null)
    nav('/groups', { replace: true, state: { anim: 'fade' } })
    toast(`Welcome, ${first}! Your account is ready.`)
  }
  const resend = () => {
    if (cool > 0) return
    setTries(0)
    setErr('')
    setCool(COOL)
    toast('A new code is on its way')
  }

  return (
    <Screen id="v-verify">
      <div className="vhead"><h1 className="display">Check your email</h1></div>
      <div className="vbody">
        <p className="sub">We sent a 6-digit code to <b style={{ color: 'var(--fg)' }}>{maskEmail(pending.email)}</b>. It expires in 10 minutes.</p>
        <label className="f" htmlFor="vf-code" style={{ marginTop: 0 }}>Code</label>
        <input id="vf-code" inputMode="numeric" maxLength={6} autoComplete="one-time-code" placeholder="••••••" value={code} style={{ fontSize: 28, letterSpacing: '.35em', textAlign: 'center' }} onChange={(e) => { setCode(e.target.value.replace(/\D/g, '')); setErr('') }} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        <ErrBar msg={err} style={{ marginTop: 10 }} />
        <div className="bar info" style={{ marginTop: 10 }}>Demo code: {DEMO_CODE}</div>
        <button className="primary" onClick={submit}>Verify and continue</button>
        <div style={{ height: 10 }} />
        <button className="secondary" disabled={cool > 0} onClick={resend}>{cool > 0 ? `Resend code (${cool}s)` : 'Resend code'}</button>
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <button className="linkbtn" onClick={() => nav(-1)}>Change email</button>
        </div>
      </div>
    </Screen>
  )
}

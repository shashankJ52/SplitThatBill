import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Screen } from '../../app/Screen'
import * as A from '../../data/actions'
import { useStore } from '../../data/store'
import { useAccount } from '../../data/account'
import { checkCode, DEMO_CODE, MAX_CODE_TRIES, maskEmail } from '../../domain/auth'
import { useToast } from '../../ui/Toast'
import { useUiState } from '../../ui/uiState'
import { ErrBar } from './parts'
import type { PendingSignup } from './Signup'
import { readPending, writePending } from './pendingSignup'

const COOL = 10

export function Verify() {
  const nav = useNavigate()
  const store = useStore()
  const toast = useToast()
  const account = useAccount()
  const [busy, setBusy] = useState(false)
  const [uiPending, setUiPending] = useUiState<PendingSignup | null>('auth.su', null)
  // with a real account the person is remembered for the browser session, so refreshing this page keeps the code step
  const [stored, setStored] = useState(readPending)
  const pending: PendingSignup | null = account ? (stored ? { ...stored, pw: '' } : null) : uiPending
  const clearPending = () => {
    setUiPending(null)
    setStored(null)
    writePending(null)
  }
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
  const welcome = first ? `Welcome, ${first}! Your account is ready.` : 'Welcome! Your account is ready.'

  const submit = async () => {
    if (account) {
      if (!/^\d{6}$/.test(code.trim())) return setErr('Enter the 6-digit code')
      if (tries >= MAX_CODE_TRIES) return setErr('Too many tries. Request a new code.')
      setBusy(true)
      const res = await account.verifySignup(pending.email, code.trim())
      setBusy(false)
      if (res.err) {
        setTries(tries + 1)
        return setErr(res.err)
      }
      setDone(true)
      clearPending()
      nav('/groups', { replace: true, state: { anim: 'fade' } })
      toast(welcome)
      return
    }
    const r = checkCode(tries, code)
    setTries(r.tries)
    if (!r.ok) return setErr(r.msg ?? '')
    store.update(() => A.createAccount({ name: pending.name, email: pending.email, tag: pending.tag }, pending.pw))
    setDone(true)
    clearPending()
    nav('/groups', { replace: true, state: { anim: 'fade' } })
    toast(welcome)
  }
  const resend = async () => {
    if (cool > 0) return
    if (account) {
      const r = await account.resendSignup(pending.email)
      if (r.err) return setErr(r.err)
    }
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
        <input id="vf-code" inputMode="numeric" maxLength={6} autoComplete="one-time-code" placeholder="••••••" value={code} style={{ fontSize: 28, letterSpacing: '.35em', textAlign: 'center' }} onChange={(e) => { setCode(e.target.value.replace(/\D/g, '')); setErr('') }} onKeyDown={(e) => e.key === 'Enter' && void submit()} />
        <ErrBar msg={err} style={{ marginTop: 10 }} />
        {!account && <div className="bar info" style={{ marginTop: 10 }}>Demo code: {DEMO_CODE}</div>}
        <button className="primary" onClick={() => void submit()} disabled={busy}>{busy ? 'Checking…' : 'Verify and continue'}</button>
        <div style={{ height: 10 }} />
        <button className="secondary" disabled={cool > 0} onClick={() => void resend()}>{cool > 0 ? `Resend code (${cool}s)` : 'Resend code'}</button>
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <button className="linkbtn" onClick={() => nav(-1)}>Change email</button>
        </div>
      </div>
    </Screen>
  )
}

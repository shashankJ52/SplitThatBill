import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Screen } from '../../app/Screen'
import * as A from '../../data/actions'
import { useAccount } from '../../data/account'
import { useAppState, useStore } from '../../data/store'
import { DEMO_PASSWORD, FRESH_LOCK, loginAttempt, type Lockout } from '../../domain/auth'
import { EMAIL_RE } from '../../domain/util'
import { useToast } from '../../ui/Toast'
import { useUiState } from '../../ui/uiState'
import { ErrBar, PwField, Social } from './parts'

export function Login() {
  const nav = useNavigate()
  const s = useAppState()
  const store = useStore()
  const account = useAccount()
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const [lock, setLock] = useUiState<Lockout>('auth.lock', FRESH_LOCK)
  const [, setForgot] = useUiState('auth.fe', '')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')

  const submit = async () => {
    const now = Date.now()
    if (now >= lock.lockUntil) {
      if (!EMAIL_RE.test(email.trim())) return setErr('Enter a valid email')
      if (!pw) return setErr('Enter your password')
    }
    if (account) {
      // while locked, nothing is sent to the server
      if (now < lock.lockUntil) return setErr(loginAttempt(lock, now, false).msg ?? '')
      setBusy(true)
      const res = await account.signIn(email.trim(), pw)
      setBusy(false)
      const a = loginAttempt(lock, now, !res.err)
      setLock(a.lock)
      if (res.err) return setErr(res.err.startsWith('Could not') ? res.err : (a.msg ?? res.err))
      nav('/groups', { replace: true, state: { anim: 'fade' } })
      toast('Welcome back')
      return
    }
    const correct = email.trim().toLowerCase() === s.profile.email.toLowerCase() && pw === s.password
    const r = loginAttempt(lock, now, correct)
    setLock(r.lock)
    if (!r.ok) return setErr(r.msg ?? '')
    store.update(A.signIn)
    nav('/groups', { replace: true, state: { anim: 'fade' } })
    toast(`Welcome back, ${s.profile.name.split(' ')[0]}`)
  }

  return (
    <Screen id="v-login">
      <div className="vhead"><h1 className="display">Log in</h1></div>
      <div className="vbody">
        <label className="f" htmlFor="lg-email" style={{ marginTop: 0 }}>Email</label>
        <input id="lg-email" type="email" autoComplete="email" maxLength={80} placeholder="you@example.com" value={email} onChange={(e) => { setEmail(e.target.value); setErr('') }} />
        <PwField id="lg-pw" label="Password" auto="current-password" value={pw} onChange={(v) => { setPw(v); setErr('') }} />
        <div style={{ textAlign: 'right', margin: '4px 0 10px' }}>
          <button className="linkbtn" onClick={() => { setForgot(email.trim()); nav('/forgot') }}>Forgot password?</button>
        </div>
        <ErrBar msg={err} />
        <button className="primary" onClick={() => void submit()} disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
        <Social />
        {!account && s.password === DEMO_PASSWORD && <div className="bar info" style={{ marginTop: 16 }}>Demo account: {s.profile.email} · {DEMO_PASSWORD}</div>}
        <div style={{ textAlign: 'center', marginTop: 6 }} className="mute">
          New here? <button className="linkbtn" onClick={() => nav('/signup', { replace: true })}>Create account</button>
        </div>
      </div>
    </Screen>
  )
}

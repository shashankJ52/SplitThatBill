import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Screen } from '../../app/Screen'
import { EMAIL_RE } from '../../domain/util'
import { useUiState } from '../../ui/uiState'
import { ErrBar } from './parts'

export function Forgot() {
  const nav = useNavigate()
  const [fe, setFe] = useUiState('auth.fe', '')
  const [email, setEmail] = useState(fe)
  const [err, setErr] = useState('')
  const [sent, setSent] = useState(false)

  const submit = () => {
    if (!EMAIL_RE.test(email.trim())) return setErr('Enter a valid email')
    setFe(email.trim())
    // the same message appears whether or not the account exists
    setSent(true)
  }
  return (
    <Screen id="v-forgot">
      <div className="vhead"><h1 className="display">Forgot password</h1></div>
      <div className="vbody">
        {sent ? (
          <>
            <div className="bar ok">If an account exists for {email.trim()}, we've sent a link to reset the password.</div>
            <p className="mute">Check your spam folder too. The link works for 30 minutes.</p>
            <button className="secondary" onClick={() => nav('/reset')}>Demo: open the reset link</button>
            <div style={{ height: 10 }} />
            <button className="primary" onClick={() => nav('/login', { replace: true })}>Back to log in</button>
          </>
        ) : (
          <>
            <p className="sub">Enter your email and we'll send a link to reset your password.</p>
            <label className="f" htmlFor="fg-email" style={{ marginTop: 0 }}>Email</label>
            <input id="fg-email" type="email" maxLength={80} autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => { setEmail(e.target.value); setErr('') }} onKeyDown={(e) => e.key === 'Enter' && submit()} />
            <ErrBar msg={err} style={{ marginTop: 10 }} />
            <div style={{ height: 10 }} />
            <button className="primary" onClick={submit}>Send reset link</button>
          </>
        )}
      </div>
    </Screen>
  )
}

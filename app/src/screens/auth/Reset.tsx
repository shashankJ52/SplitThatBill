import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Screen } from '../../app/Screen'
import * as A from '../../data/actions'
import { useAccount, useRecovering } from '../../data/account'
import { useAppState, useStore } from '../../data/store'
import { passwordProblem } from '../../domain/auth'
import { useToast } from '../../ui/Toast'
import { useUiState } from '../../ui/uiState'
import { ErrBar, Meter, PwField } from './parts'

export function Reset() {
  const nav = useNavigate()
  const s = useAppState()
  const store = useStore()
  const toast = useToast()
  const account = useAccount()
  const recovering = useRecovering()
  const [fe] = useUiState('auth.fe', '')
  const [pw, setPw] = useState('')
  const [con, setCon] = useState('')
  const [err, setErr] = useState('')

  const submit = async () => {
    const bad = passwordProblem(pw)
    if (bad) return setErr(bad)
    if (pw !== con) return setErr("Passwords don't match")
    if (account) {
      const r = await account.setNewPassword(pw)
      if (r.err) return setErr(r.err)
      nav('/login', { replace: true })
      toast('Password updated. Log in with your new password.')
      return
    }
    // only the matching account changes; any other email gets the same success screen
    if (fe.toLowerCase() === s.profile.email.toLowerCase()) store.update((x) => A.setPassword(x, pw))
    nav('/login', { replace: true })
    toast('Password updated. Log in with your new password.')
  }
  return (
    <Screen id="v-reset">
      <div className="vhead"><h1 className="display">New password</h1></div>
      <div className="vbody">
        {account && !recovering ? (
          <>
            <div className="bar bad">This reset link has expired or was already used.</div>
            <button className="primary" onClick={() => nav('/forgot', { replace: true })}>Request a new link</button>
          </>
        ) : (
          <>
        <p className="sub">Choose a new password for {fe || 'your account'}.</p>
        <PwField id="rs-pw" label="New password" auto="new-password" value={pw} onChange={(v) => { setPw(v); setErr('') }} first />
        <Meter value={pw} />
        <PwField id="rs-con" label="Confirm new password" auto="new-password" value={con} onChange={(v) => { setCon(v); setErr('') }} />
        <ErrBar msg={err} style={{ marginTop: 10 }} />
        <div style={{ height: 10 }} />
        <button className="primary" onClick={() => void submit()}>Update password</button>
          </>
        )}
      </div>
    </Screen>
  )
}

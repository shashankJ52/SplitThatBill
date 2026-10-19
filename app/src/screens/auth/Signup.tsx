import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Screen } from '../../app/Screen'
import { useAppState } from '../../data/store'
import { normTag, signupProblem, tagStatus } from '../../domain/auth'
import { ME } from '../../domain/types'
import { useUiState } from '../../ui/uiState'
import { ErrBar, Meter, PwField, Social } from './parts'

export interface PendingSignup {
  name: string
  email: string
  tag: string
  pw: string
}

export function Signup() {
  const nav = useNavigate()
  const s = useAppState()
  const [pending, setPending] = useUiState<PendingSignup | null>('auth.su', null)
  const [name, setName] = useState(pending?.name ?? '')
  const [email, setEmail] = useState(pending?.email ?? '')
  const [tag, setTag] = useState(pending ? `@${pending.tag}` : '')
  const [pw, setPw] = useState(pending?.pw ?? '')
  const [terms, setTerms] = useState(false)
  const [err, setErr] = useState('')
  const taken = Object.values(s.people).filter((p) => p.id !== ME && p.tag).map((p) => p.tag as string)
  const st = tagStatus(tag, taken)

  const submit = () => {
    const problem = signupProblem({ name, email, tag, pw, terms }, taken, s.profile.email)
    if (problem) return setErr(problem)
    setPending({ name: name.trim(), email: email.trim(), tag: normTag(tag), pw })
    nav('/verify')
  }
  const clear = <T,>(set: (v: T) => void) => (v: T) => {
    set(v)
    setErr('')
  }

  return (
    <Screen id="v-signup">
      <div className="vhead"><h1 className="display">Create account</h1></div>
      <div className="vbody">
        <label className="f" htmlFor="su-name" style={{ marginTop: 0 }}>Your name</label>
        <input id="su-name" maxLength={40} autoComplete="name" value={name} placeholder="e.g. Alex Rivera" onChange={(e) => clear(setName)(e.target.value)} />
        <label className="f" htmlFor="su-email">Email</label>
        <input id="su-email" type="email" maxLength={80} autoComplete="email" value={email} placeholder="you@example.com" onChange={(e) => clear(setEmail)(e.target.value)} />
        <label className="f" htmlFor="su-tag">User tag</label>
        <div className="pw">
          <input id="su-tag" maxLength={21} autoCapitalize="none" autoComplete="username" value={tag} placeholder="@alex" style={{ paddingRight: 90 }} onChange={(e) => clear(setTag)(e.target.value)} />
          <span className="eye mute" style={{ pointerEvents: 'none', fontSize: 13, color: st === 'ok' ? 'var(--green-t)' : st ? 'var(--red-t)' : undefined }} aria-live="polite">
            {st === 'ok' ? 'Available ✓' : st === 'taken' ? 'Taken' : st === 'invalid' ? 'Invalid' : ''}
          </span>
        </div>
        <div className="mute" style={{ fontSize: 12, marginTop: 4 }}>Friends add you with this. 3–20 letters, numbers or _.</div>
        <PwField id="su-pw" label="Password" auto="new-password" value={pw} onChange={clear(setPw)} />
        <Meter value={pw} />
        <label className="switch" style={{ margin: '14px 0' }}>
          <input type="checkbox" checked={terms} onChange={(e) => clear(setTerms)(e.target.checked)} />
          <span className="mute" style={{ fontSize: 14 }}>I agree to the Terms and Privacy Policy</span>
        </label>
        <ErrBar msg={err} />
        <button className="primary" onClick={submit}>Create account</button>
        <Social />
        <div style={{ textAlign: 'center', marginTop: 14 }} className="mute">
          Already have an account? <button className="linkbtn" onClick={() => nav('/login', { replace: true })}>Log in</button>
        </div>
      </div>
    </Screen>
  )
}

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Screen } from '../../app/Screen'
import { useAccount } from '../../data/account'
import { useAppState } from '../../data/store'
import { normTag, signupProblem, tagStatus } from '../../domain/auth'
import { ME } from '../../domain/types'
import { useToast } from '../../ui/Toast'
import { useUiState } from '../../ui/uiState'
import { readPending, writePending } from './pendingSignup'
import { StepsCarousel } from '../../ui/StepsCarousel'
import { ErrBar, Meter, PwField } from './parts'

export interface PendingSignup {
  name: string
  email: string
  tag: string
  /** only kept in memory, and only for the demo (no backend) sign-up */
  pw: string
}

export function Signup() {
  const nav = useNavigate()
  const s = useAppState()
  const account = useAccount()
  const toast = useToast()
  const [pending, setPending] = useUiState<PendingSignup | null>('auth.su', null)
  const [stored] = useState(readPending)
  const back = pending ?? stored
  const [name, setName] = useState(back?.name ?? '')
  const [email, setEmail] = useState(back?.email ?? '')
  const [tag, setTag] = useState(back?.tag ? `@${back.tag}` : '')
  const [pw, setPw] = useState(pending?.pw ?? '')
  const [terms, setTerms] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  // the database has the final say on whether a tag is free
  const [remote, setRemote] = useState<{ tag: string; free: boolean | null } | null>(null)
  const taken = Object.values(s.people).filter((p) => p.id !== ME && p.tag).map((p) => p.tag as string)
  const local = tagStatus(tag, account ? [] : taken)
  const free = remote && remote.tag === normTag(tag) ? remote.free : undefined
  const st = local === 'ok' && free === false ? 'taken' : local

  useEffect(() => {
    if (!account || local !== 'ok') return
    const t = normTag(tag)
    const h = setTimeout(() => void account.tagAvailable(t).then((f) => setRemote({ tag: t, free: f })), 400)
    return () => clearTimeout(h)
  }, [account, local, tag])

  const submit = async () => {
    const problem = signupProblem({ name, email, tag, pw, terms }, account ? [] : taken, account ? undefined : s.profile.email)
    if (problem) return setErr(problem)
    if (account) {
      setBusy(true)
      const r = await account.signUp({ name: name.trim(), email: email.trim(), tag: normTag(tag), password: pw })
      setBusy(false)
      if (r.err) return setErr(r.err)
      if (r.needsConfirm) {
        // the password stays on this screen only; the code step needs just the email
        writePending({ name: name.trim(), email: email.trim(), tag: normTag(tag) })
        nav('/verify')
        return
      }
      nav('/groups', { replace: true, state: { anim: 'fade' } })
      toast(`Welcome, ${name.trim().split(' ')[0]}! Your account is ready.`)
      return
    }
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
        <StepsCarousel />
        <label className="f" htmlFor="su-name">Your name</label>
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
          <span className="mute" style={{ fontSize: 14 }}>
            I agree to the <a href="/terms" target="_blank" rel="noopener" style={{ color: 'var(--fg)', fontWeight: 700 }}>Terms</a> and <a href="/privacy" target="_blank" rel="noopener" style={{ color: 'var(--fg)', fontWeight: 700 }}>Privacy Policy</a>
          </span>
        </label>
        <ErrBar msg={err} />
        <button className="primary" onClick={() => void submit()} disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
        <div style={{ textAlign: 'center', marginTop: 14 }} className="mute">
          Already have an account? <button className="linkbtn" onClick={() => nav('/login', { replace: true })}>Log in</button>
        </div>
      </div>
    </Screen>
  )
}

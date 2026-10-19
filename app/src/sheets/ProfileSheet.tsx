import { useState } from 'react'
import * as A from '../data/actions'
import { useAppState, useStore } from '../data/store'
import { normTag, passwordProblem, tagStatus } from '../domain/auth'
import { ME } from '../domain/types'
import { EMAIL_RE, TAG_RE } from '../domain/util'
import { useToast } from '../ui/Toast'

export type ProfileField = 'name' | 'email' | 'tag' | 'pw'
const TITLES: Record<ProfileField, string> = { name: 'Name', email: 'Email', tag: 'User tag', pw: 'Change password' }
export const profileTitle = (f: ProfileField) => TITLES[f]

/** Edit one part of your profile. Each field is checked before it is saved. */
export function ProfileSheet({ field, close }: { field: ProfileField; close: () => void }) {
  const s = useAppState()
  const store = useStore()
  const toast = useToast()
  const p = s.profile
  const [v, setV] = useState(field === 'tag' ? `@${p.tag}` : field === 'name' ? p.name : field === 'email' ? p.email : '')
  const [cur, setCur] = useState('')
  const [nw, setNw] = useState('')
  const [con, setCon] = useState('')
  const [err, setErr] = useState('')

  const taken = Object.values(s.people).filter((x) => x.id !== ME && x.tag).map((x) => x.tag as string)
  const st = field === 'tag' ? tagStatus(v, taken) : ''

  const save = () => {
    if (field === 'pw') {
      if (!cur) return setErr('Enter your current password')
      if (cur !== s.password) return setErr('Current password is wrong')
      const bad = passwordProblem(nw)
      if (bad) return setErr(bad)
      if (nw === cur) return setErr('New password must be different')
      if (nw !== con) return setErr("Passwords don't match")
      store.update((x) => A.setPassword(x, nw))
      close()
      return toast('Password changed')
    }
    const t = v.trim()
    if (field === 'name') {
      if (!t) return setErr("Name can't be empty")
      store.update((x) => A.setProfile(x, { name: t }))
    } else if (field === 'email') {
      if (!EMAIL_RE.test(t)) return setErr('Enter a valid email')
      store.update((x) => A.setProfile(x, { email: t }))
    } else {
      const tag = normTag(t)
      if (!TAG_RE.test(tag)) return setErr('3–20 letters, numbers or underscores')
      if (tag !== p.tag && tagStatus(tag, taken) === 'taken') return setErr(`@${tag} is taken`)
      store.update((x) => A.setProfile(x, { tag }))
    }
    close()
    toast('Saved')
  }

  return (
    <>
      {field === 'pw' ? (
        <>
          <label className="f" htmlFor="a-cur">Current password</label>
          <input id="a-cur" type="password" autoComplete="current-password" value={cur} onChange={(e) => { setCur(e.target.value); setErr('') }} />
          <label className="f" htmlFor="a-new">New password</label>
          <input id="a-new" type="password" autoComplete="new-password" value={nw} onChange={(e) => { setNw(e.target.value); setErr('') }} />
          <label className="f" htmlFor="a-con">Confirm new password</label>
          <input id="a-con" type="password" autoComplete="new-password" value={con} onChange={(e) => { setCon(e.target.value); setErr('') }} />
        </>
      ) : (
        <>
          <label className="f" htmlFor="a-v">{TITLES[field]}</label>
          <input id="a-v" maxLength={field === 'tag' ? 21 : 80} autoCapitalize={field === 'tag' ? 'none' : undefined} type={field === 'email' ? 'email' : 'text'} value={v} onChange={(e) => { setV(e.target.value); setErr('') }} autoFocus />
          {field === 'tag' && st && v !== `@${p.tag}` && (
            <div className="mute" style={{ fontSize: 13, marginTop: 4, color: st === 'ok' ? 'var(--green-t)' : 'var(--red-t)' }}>{st === 'ok' ? 'Available ✓' : st === 'taken' ? 'Taken' : 'Invalid'}</div>
          )}
        </>
      )}
      {err && <div className="bar bad" role="alert" style={{ marginTop: 10 }}>{err}</div>}
      <div style={{ height: 10 }} />
      <button className="primary" onClick={save}>Save</button>
    </>
  )
}

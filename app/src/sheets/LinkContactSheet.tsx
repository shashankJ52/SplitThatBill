import { useState } from 'react'
import { useAccount } from '../data/account'
import { useAppState, useStore } from '../data/store'
import * as A from '../data/actions'
import { linkTargets } from '../domain/membership'
import { ledgerName } from '../domain/selectors'
import { TAG_RE } from '../domain/util'
import { Avatar, Bullet } from '../ui/bits'
import { useToast } from '../ui/Toast'

interface Found { id: string; name: string; tag: string }

/**
 * Turn a placeholder name (someone added without an account) into the real person once they have signed up. Their old
 * bills and payments carry over to the account, and they are invited, so they see the group after they accept.
 */
export function LinkContactSheet({ pid, close }: { pid: string; close: () => void }) {
  const s = useAppState()
  const store = useStore()
  const toast = useToast()
  const account = useAccount()
  const [tag, setTag] = useState('')
  const [found, setFound] = useState<Found | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const person = s.people[pid]
  const targets = linkTargets(s, pid)
  // in how many of those places the person is already a member or invited (their bills are then combined, with no new invite)
  const alreadyIn = found ? targets.filter((id) => { const g = s.ledgers.find((l) => l.id === id); return !!g && (g.members.includes(found.id) || !!g.invited?.includes(found.id)) }).length : 0
  if (!account || !person) return <p className="mute">This is not available right now.</p>

  const find = async () => {
    const t = tag.trim().replace(/^@/, '').toLowerCase()
    setFound(null)
    if (!TAG_RE.test(t)) return setErr('A usertag is 3–20 letters, numbers or _')
    if (t === s.profile.tag.toLowerCase()) return setErr("That's your own tag")
    setBusy(true)
    const r = await account.findUser(t)
    setBusy(false)
    if (!r) return setErr(`No one is using @${t} yet. Ask them to sign up, then try again.`)
    setErr('')
    setFound(r)
  }

  const link = async () => {
    if (!found) return
    setBusy(true)
    const problems: string[] = []
    for (const gid of targets) {
      const r = await account.linkContact(gid, pid, found.id)
      if (r.err) problems.push(r.err)
    }
    setBusy(false)
    if (problems.length === targets.length) return setErr(problems[0])
    // keep them in your people list, then let the sheet go: the invite and the rewritten bills have already been reloaded
    store.update((st) => A.rememberFriend(st, found))
    toast(problems.length ? `Linked in some places. ${problems[0]}` : alreadyIn === targets.length ? `${person.name} is now ${found.name}` : `${person.name} is now ${found.name}. They have been invited.`)
    close()
  }

  return (
    <>
      <div className="row" style={{ marginBottom: 8 }}>
        <Avatar pid={pid} size={44} />
        <div className="grow"><b>{person.name}</b><div className="mute">A name without an account</div></div>
      </div>
      <p className="mute">When {person.name} has signed up, link this name to their account. Every bill and payment with {person.name} stays, and becomes theirs. Nothing needs to be entered again.</p>
      <label className="f" htmlFor="lk-tag">Their usertag</label>
      <div className="row">
        <input id="lk-tag" placeholder="@usertag" maxLength={21} autoCapitalize="none" autoCorrect="off" value={tag} onChange={(e) => { setTag(e.target.value); setFound(null); setErr('') }} onKeyDown={(e) => e.key === 'Enter' && void find()} />
        <button className="secondary" style={{ width: 92, padding: 11 }} disabled={busy || !tag.trim()} onClick={() => void find()}>Find</button>
      </div>
      {err && <div className="bar bad" role="alert" style={{ marginTop: 8 }}>{err}</div>}
      {found && (
        <div className="card" style={{ marginTop: 10 }}>
          <div className="row">
            <Bullet letter={found.name.charAt(0).toUpperCase()} color="#0039A6" size={40} />
            <div className="grow"><b>{found.name}</b> <span className="pill">@{found.tag}</span></div>
          </div>
          <p className="mute" style={{ margin: '8px 0' }}>
            Link {person.name} to {found.name} in {targets.length === 1 ? `${ledgerName(s, s.ledgers.find((l) => l.id === targets[0])!)}` : `${targets.length} groups and splits`}?{' '}
            {alreadyIn === targets.length
              ? `${found.name} is already there, so no invite is needed: everything entered for ${person.name} simply becomes ${found.name}'s.`
              : alreadyIn > 0
                ? `Where ${found.name} is already in, everything for ${person.name} becomes theirs. Elsewhere they get an invite and can see it after accepting.`
                : `${found.name} gets an invite and can see the group after accepting.`}
          </p>
          <button className="primary" disabled={busy || targets.length === 0} onClick={() => void link()}>{busy ? 'Linking…' : `Link to ${found.name}`}</button>
        </div>
      )}
      {targets.length === 0 && <div className="bar info" style={{ marginTop: 8 }}>You do not run any group or split with {person.name}, so there is nothing to link here yet.</div>}
      <div style={{ height: 10 }} />
      <button className="secondary" onClick={close}>Cancel</button>
    </>
  )
}

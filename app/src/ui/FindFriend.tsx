import { useEffect, useState } from 'react'
import { useAccount } from '../data/account'
import { useStore } from '../data/store'
import * as A from '../data/actions'
import { TAG_RE } from '../domain/util'
import { Bullet } from './bits'
import { shareMyTag } from './shareTag'
import { useAddPerson } from './useAddPerson'
import { useToast } from './Toast'
import { Loading } from './Loading'

type Status = 'idle' | 'checking' | 'invalid' | 'self' | 'none' | 'found'
interface Found { id: string; name: string; tag: string }

/**
 * One box for adding someone. Type @ and a usertag and the person is looked up as you type; type a plain name to add
 * someone who is not on the app. When nobody has that tag yet, you can send them an invite.
 */
export function FindFriend({ current, onPick, inButton = 'Open' }: { current: string[]; onPick: (id: string) => void; /** the button for someone who is already in `current`; empty for none */ inButton?: string }) {
  const account = useAccount()
  const store = useStore()
  const toast = useToast()
  const addByInput = useAddPerson()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [found, setFound] = useState<Found | null>(null)
  const [busy, setBusy] = useState(false)
  const text = q.trim()
  const isTag = text.startsWith('@')
  const tag = text.slice(1).toLowerCase()

  useEffect(() => {
    setFound(null)
    if (!isTag || tag.length === 0) return setStatus('idle')
    if (!TAG_RE.test(tag)) return setStatus(tag.length < 3 ? 'idle' : 'invalid')
    if (tag === store.get().profile.tag.toLowerCase()) return setStatus('self')
    setStatus('checking')
    let live = true
    const timer = setTimeout(() => {
      void account?.findUser(tag).then((r) => {
        if (!live) return
        setFound(r)
        setStatus(r ? 'found' : 'none')
      })
    }, 350)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [isTag, tag, account, store])

  const addFound = () => {
    if (!found) return
    store.update((st) => A.rememberFriend(st, found))
    onPick(found.id)
  }
  const addName = async () => {
    setBusy(true)
    const r = await addByInput(text, current)
    setBusy(false)
    if (r.err || !r.id) return toast(r.err ?? 'Could not add')
    onPick(r.id)
  }

  return (
    <>
      <div className="row">
        <input
          placeholder="@usertag, or a name" maxLength={30} value={q} aria-label="Find by usertag or add a name" autoCapitalize="none" autoCorrect="off"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (found ? addFound() : text && !isTag && void addName())}
        />
      </div>
      <div aria-live="polite" style={{ marginTop: 8 }}>
        {status === 'idle' && !text && <div className="mute">Type @ and their usertag to find a friend with the app, or just a name to add someone without it.</div>}
        {status === 'idle' && isTag && tag.length > 0 && <div className="mute">Keep typing, usertags are at least 3 characters.</div>}
        {status === 'invalid' && <div className="bar bad">A usertag is 3–20 letters, numbers or _</div>}
        {status === 'self' && <div className="bar info">That's your own tag.</div>}
        {status === 'checking' && <Loading>Looking for @{tag}…</Loading>}
        {status === 'found' && found && (
          <div className="card">
            <div className="row">
              <Bullet letter={found.name.charAt(0).toUpperCase()} color="#0039A6" size={40} />
              <div className="grow"><b>{found.name}</b> <span className="pill">@{found.tag}</span>{current.includes(found.id) && <div className="mute">Already here</div>}</div>
              {(!current.includes(found.id) || inButton) && <button className="primary" style={{ width: 'auto', padding: '10px 18px' }} onClick={addFound}>{current.includes(found.id) ? inButton : 'Add'}</button>}
            </div>
          </div>
        )}
        {status === 'none' && (
          <div className="card">
            <b>No one is using @{tag} yet</b>
            <p className="mute" style={{ margin: '6px 0 10px' }}>Check the spelling, or invite them. When they sign up through your link, they are easy to find.</p>
            <button className="secondary" onClick={() => void shareMyTag(store.get().profile.tag, toast)}>Invite them to SplitThatBill</button>
          </div>
        )}
        {text && !isTag && (
          <button className="secondary" disabled={busy} onClick={() => void addName()}>Add “{text}” (no account needed)</button>
        )}
      </div>
    </>
  )
}

import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Screen } from '../app/Screen'
import { clearPendingFriendTag } from '../app/pendingJoin'
import * as A from '../data/actions'
import { useAccount, useAccountMode } from '../data/account'
import { useAppState, useStore } from '../data/store'
import { TAG_RE } from '../domain/util'
import { Bullet, Empty } from '../ui/bits'
import { Loading } from '../ui/Loading'

type Found = { id: string; name: string; tag: string }

/** Where a friend's invite link (/u/their-tag) lands: shows who it is and adds them to your people in one tap. */
export function FriendPage() {
  const { tag: raw = '' } = useParams()
  const tag = raw.replace(/^@/, '').toLowerCase()
  const account = useAccount()
  const mode = useAccountMode()
  const s = useAppState()
  const store = useStore()
  const nav = useNavigate()
  const [found, setFound] = useState<Found | null | undefined>(undefined)

  useEffect(() => {
    clearPendingFriendTag()
    if (!account || mode !== 'cloud' || !TAG_RE.test(tag)) return
    let live = true
    void account.findUser(tag).then((r) => live && setFound(r))
    return () => {
      live = false
    }
  }, [account, mode, tag])

  const mine = tag === s.profile.tag.toLowerCase()
  const add = () => {
    if (!found) return
    store.update((st) => A.rememberFriend(st, found))
    nav(`/person/${found.id}`, { replace: true })
  }
  const known = found ? !!s.people[found.id] : false

  return (
    <Screen id="v-friend">
      <div className="vhead"><h1 className="display">Add a friend</h1></div>
      <div className="vbody">
        {mode !== 'cloud' ? (
          <Empty title="Log in to add friends">Friends are added by their usertag, which needs a real account. Log out of the demo, log in, then open the link again.</Empty>
        ) : !TAG_RE.test(tag) ? (
          <Empty title="This link is not valid">A usertag is 3–20 letters, numbers or _. Ask your friend to share their tag again.</Empty>
        ) : mine ? (
          <Empty title="That's you">This is your own invite link. Send it to a friend so they can add you.</Empty>
        ) : found === undefined ? (
          <Loading>Looking for @{tag}…</Loading>
        ) : found === null ? (
          <Empty title={`No one is using @${tag}`}>The link may have a typo. Ask your friend to share their tag again.</Empty>
        ) : (
          <>
            <div className="card">
              <div className="row">
                <Bullet letter={found.name.charAt(0).toUpperCase()} color="#0039A6" size={48} />
                <div className="grow"><div className="gname">{found.name}</div><div className="mute">@{found.tag}</div></div>
              </div>
            </div>
            <p className="mute">{known ? `${found.name} is already in your people.` : `Add ${found.name} to split bills and add them to groups. They only see what you put them in.`}</p>
            <button className="primary" onClick={add}>{known ? 'Open' : `Add ${found.name}`}</button>
            <div style={{ height: 10 }} />
            <button className="secondary" onClick={() => nav('/groups', { replace: true })}>Not now</button>
          </>
        )}
      </div>
    </Screen>
  )
}

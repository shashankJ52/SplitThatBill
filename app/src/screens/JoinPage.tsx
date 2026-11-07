import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Screen } from '../app/Screen'
import { useAccount, useAccountMode } from '../data/account'
import { clearPendingJoin } from '../app/pendingJoin'
import { Empty } from '../ui/bits'
import { useToast } from '../ui/Toast'
import { Loading } from '../ui/Loading'

/** Where a group link lands. Shows only the group name and who runs it; joining needs an admin's approval. */
export function JoinPage() {
  const { code = '' } = useParams()
  const account = useAccount()
  const mode = useAccountMode()
  const nav = useNavigate()
  const toast = useToast()
  const [info, setInfo] = useState<{ groupName: string; ownerName: string } | null | undefined>(undefined)
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    clearPendingJoin()
    if (!account || mode !== 'cloud') return
    let live = true
    void account.preview(code).then((r) => live && setInfo(r))
    return () => {
      live = false
    }
  }, [account, mode, code])

  const request = async () => {
    if (!account) return
    setBusy(true)
    const r = await account.requestJoin(code)
    setBusy(false)
    if (r.err) return toast(r.err)
    if (r.status === 'member') {
      toast('You are already in this group')
      return nav('/groups', { replace: true })
    }
    setSent(true)
  }

  return (
    <Screen id="v-join">
      <div className="vhead"><h1 className="display">Join a group</h1></div>
      <div className="vbody">
        {mode !== 'cloud' ? (
          <Empty title="Log in to use this link">Group links work with a real account. Log out of the demo, log in, then open the link again.</Empty>
        ) : info === undefined ? (
          <Loading>Checking the link…</Loading>
        ) : info === null ? (
          <Empty title="This link is not valid any more">Ask the person who sent it for a new one.</Empty>
        ) : sent ? (
          <>
            <div className="bar ok">Request sent to the admins of {info.groupName}.</div>
            <p className="mute">You will get an alert when someone approves it. Until then you cannot see anything in the group.</p>
            <button className="primary" onClick={() => nav('/groups', { replace: true })}>Back to my groups</button>
          </>
        ) : (
          <>
            <div className="card">
              <div className="gname">{info.groupName}</div>
              <div className="mute">Run by {info.ownerName}</div>
            </div>
            <p className="mute">You can ask to join. An admin has to approve you, and until then you will see no bills, people or amounts.</p>
            <button className="primary" disabled={busy} onClick={() => void request()}>{busy ? 'Sending…' : 'Request to join'}</button>
            <div style={{ height: 10 }} />
            <button className="secondary" onClick={() => nav('/groups', { replace: true })}>Not now</button>
          </>
        )}
      </div>
    </Screen>
  )
}

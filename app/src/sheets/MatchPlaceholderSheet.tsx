import { useState } from 'react'
import { useAccount } from '../data/account'
import { useAppState } from '../data/store'
import { balanceOf, placeholdersIn } from '../domain/membership'
import { ledgerById, personName } from '../domain/selectors'
import { Avatar } from '../ui/bits'
import { useMoney } from '../ui/useMoney'
import { useToast } from '../ui/Toast'

/**
 * Someone with an account is in the group (they joined, accepted an invite, or are waiting to join) and the admin may
 * know them as one of the group's placeholder names. Pick the name and everything that was entered for it becomes theirs,
 * or keep them as a new person. When `join` is set this is also where the request is approved.
 */
export function MatchPlaceholderSheet({ gid, pid, join, close }: { gid: string; pid: string; join?: boolean; close: () => void }) {
  const s = useAppState()
  const account = useAccount()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const l = ledgerById(s, gid)
  const fmt = useMoney(l)
  if (!account || !l) return <p className="mute">This is not available right now.</p>
  const name = personName(s, pid)
  const names = placeholdersIn(s, l)

  const go = async (placeholder: string | null) => {
    setBusy(true)
    setErr('')
    if (join) {
      const a = await account.decideJoin(gid, pid, true)
      if (a.err) {
        setBusy(false)
        return setErr(a.err)
      }
    }
    if (placeholder) {
      const r = await account.linkContact(gid, placeholder, pid)
      if (r.err) {
        setBusy(false)
        // someone approved here is already in, so only the matching failed
        if (join) toast(`${name} joined. Could not match them: ${r.err}`)
        else setErr(r.err)
        if (join) close()
        return
      }
    }
    setBusy(false)
    toast(placeholder ? `${name} is now ${personName(s, placeholder)}` : join ? `${name} joined as a new person` : `${name} stays a separate person`)
    close()
  }

  return (
    <>
      <p className="mute">
        {join ? `${name} asked to join.` : `${name} is in this group.`} Is {name} one of the names you already added? If so, everything entered for that name becomes {name}'s and nothing needs to be entered again.
      </p>
      {names.length ? (
        names.map((p) => {
          const n = balanceOf(l, p)
          return (
            <button key={p} className="card tap row" style={{ width: '100%', textAlign: 'left' }} disabled={busy} onClick={() => void go(p)}>
              <Avatar pid={p} size={32} />
              <div className="grow">
                <b>{personName(s, p)}</b>
                <div className="mute">{n > 0 ? `is owed ${fmt(n)}` : n < 0 ? `owes ${fmt(-n)}` : 'settled up'}</div>
              </div>
              <span className="mute">{join ? 'Approve as this' : 'This is them'}</span>
            </button>
          )
        })
      ) : (
        <div className="bar info">There are no names without an account in this group.</div>
      )}
      {err && <div className="bar bad" role="alert" style={{ marginTop: 8 }}>{err}</div>}
      <div style={{ height: 10 }} />
      <button className="secondary" disabled={busy} onClick={() => (join ? void go(null) : close())}>{join ? 'A new person: just approve' : 'Not any of them'}</button>
      {join && <button className="linkbtn" style={{ marginTop: 8 }} disabled={busy} onClick={close}>Decide later</button>}
    </>
  )
}

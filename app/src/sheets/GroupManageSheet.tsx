import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as A from '../data/actions'
import { useAccount } from '../data/account'
import { useAppState, useStore } from '../data/store'
import { isAdmin, isOwner, isShared, memberActions, memberLines, myRole, removalCheck, writeOffPayments, type MemberLine } from '../domain/membership'
import { ledgerById, letterOf, personName } from '../domain/selectors'
import { ME } from '../domain/types'
import { fmt, today, uid } from '../domain/util'
import { Avatar, Bullet } from '../ui/bits'
import { useSheet } from '../ui/Sheet'
import { useToast } from '../ui/Toast'
import { useAddPerson } from '../ui/useAddPerson'
import { GroupSheet } from './GroupSheet'
import { PaySheet } from './PaySheet'

const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', member: 'Member' } as const
type Panel =
  | { kind: 'remove'; m: MemberLine }
  | { kind: 'leave' }
  | { kind: 'transfer' }
  | { kind: 'delete' }
  | null

/** Group settings for a group that lives in the shared database: people, roles, invites, the group link and leaving. */
export function GroupManageSheet({ gid, close }: { gid: string; close: () => void }) {
  const s = useAppState()
  const store = useStore()
  const account = useAccount()
  const sheet = useSheet()
  const toast = useToast()
  const nav = useNavigate()
  const addByInput = useAddPerson()
  const l = ledgerById(s, gid)
  const [add, setAdd] = useState('')
  const [busy, setBusy] = useState(false)
  const [panel, setPanel] = useState<Panel>(null)

  if (!l || !account || !isShared(l)) return <p className="mute">This group is not available.</p>
  const admin = isAdmin(l)
  const owner = isOwner(l)
  const lines = memberLines(s, l)
  const link = l.inviteCode ? `${window.location.origin}/join/${l.inviteCode}` : null
  const name = l.name ?? '1-1 split'

  /** Run a server call, show its error or a confirmation. */
  const act = async (run: () => Promise<{ err?: string }>, done?: string) => {
    setBusy(true)
    const r = await run()
    setBusy(false)
    if (r.err) toast(r.err)
    else if (done) toast(done)
    return !r.err
  }

  const invite = async () => {
    const r = await addByInput(add, l.members)
    if (r.err || !r.id) return toast(r.err ?? 'Could not add')
    const id = r.id
    if (s.people[id]?.user || store.get().people[id]?.user) {
      if (await act(() => account.invite(gid, id), `Invite sent to ${personName(store.get(), id)}`)) setAdd('')
    } else {
      store.update((st) => A.updateGroup(st, gid, { members: [...(ledgerById(st, gid)?.members ?? []), id] }))
      toast(`${personName(store.get(), id)} added`)
      setAdd('')
    }
  }
  const copy = async (text: string, ok: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast(ok)
    } catch {
      toast('Copy blocked. Select the link manually.')
    }
  }
  const removeNow = async (m: MemberLine, writeOff: boolean) => {
    if (writeOff) {
      const note = `Written off when ${m.name} was removed`
      const pays = writeOffPayments(l, m.pid, () => uid('p'), today(), note)
      store.update((st) => pays.reduce((acc, p) => A.addPayment(acc, gid, p), st))
    }
    if (await act(() => account.removeMember(gid, m.pid), `${m.name} removed`)) setPanel(null)
  }

  const removePanel = (m: MemberLine) => {
    const check = removalCheck(l, m.pid)
    if (check.ok)
      return (
        <div className="card">
          <b>Remove {m.name}?</b>
          <p className="mute">They lose access to this group. Their old bills stay exactly as they were.</p>
          <button className="primary" disabled={busy} onClick={() => void removeNow(m, false)}>Remove {m.name}</button>
          <div style={{ height: 8 }} />
          <button className="secondary" onClick={() => setPanel(null)}>Cancel</button>
        </div>
      )
    return (
      <div className="card">
        <b>{m.name} {check.net > 0 ? `is owed ${fmt(check.net)}` : `owes ${fmt(-check.net)}`}</b>
        <p className="mute">Settle up first, then remove them. If they will not settle, you can write the balance off. That records a visible adjustment so everyone else's balances stay correct.</p>
        <button className="primary" onClick={() => sheet.open('Record payment', (c) => <PaySheet gid={gid} close={c} />)}>Record a payment</button>
        <div style={{ height: 8 }} />
        <button className="secondary danger" disabled={busy} onClick={() => void removeNow(m, true)}>Remove and write off {fmt(Math.abs(check.net))}</button>
        <div style={{ height: 8 }} />
        <button className="secondary" onClick={() => setPanel(null)}>Cancel</button>
      </div>
    )
  }

  const leave = async () => {
    if (!(await act(() => account.leaveGroup(gid), 'You left the group'))) return
    close()
    nav('/groups', { replace: true })
  }
  const transfer = async (m: MemberLine) => {
    if (await act(() => account.transferOwnership(gid, m.pid), `${m.name} is now the owner`)) setPanel(null)
  }
  const destroy = () => {
    store.update((st) => A.deleteGroup(st, gid))
    close()
    nav('/groups', { replace: true })
    toast('Group deleted')
  }

  return (
    <>
      <div className="row" style={{ marginBottom: 6 }}>
        <Bullet letter={letterOf(name)} color={l.color ?? '#A7A9AC'} size={44} />
        <div className="grow">
          <div className="gname">{name}</div>
          <div className="mute">You are {myRole(l) === 'admin' ? 'an admin' : myRole(l) === 'owner' ? 'the owner' : 'a member'}</div>
        </div>
      </div>
      {admin && (
        <button className="secondary" onClick={() => sheet.open('Group settings', (c) => <GroupSheet gid={gid} close={c} />)}>Edit name, colour and debts</button>
      )}

      <label className="f">People</label>
      {lines.map((m) => {
        const a = memberActions(l, m)
        return (
          <div key={m.pid}>
            <div className="row" style={{ padding: '6px 0', flexWrap: 'wrap' }}>
              <Avatar pid={m.pid} size={32} />
              <div className="grow" style={{ minWidth: 120 }}>
                <b>{m.isYou ? 'You' : m.name}</b>{' '}
                {m.tag && !m.isYou && <span className="pill">@{m.tag}</span>}
                {m.contact && <span className="pill">no account</span>}
                {m.role !== 'member' && <span className="pill">{ROLE_LABEL[m.role]}</span>}
                <div className="mute">{m.net > 0 ? `is owed ${fmt(m.net)}` : m.net < 0 ? `owes ${fmt(-m.net)}` : 'settled up'}</div>
              </div>
              {a.promote && <button className="linkbtn" disabled={busy} onClick={() => void act(() => account.setRole(gid, m.pid, 'admin'), `${m.name} is now an admin`)}>Make admin</button>}
              {a.demote && <button className="linkbtn" disabled={busy} onClick={() => void act(() => account.setRole(gid, m.pid, 'member'), `${m.name} is a member again`)}>Remove admin</button>}
              {a.remove && <button className="del" aria-label={`Remove ${m.name}`} onClick={() => setPanel({ kind: 'remove', m })}>✕</button>}
            </div>
            {panel?.kind === 'remove' && panel.m.pid === m.pid && removePanel(m)}
          </div>
        )
      })}
      {(l.invited ?? []).map((p) => (
        <div className="row" style={{ padding: '6px 0' }} key={p}>
          <Avatar pid={p} size={32} />
          <div className="grow">
            <b>{personName(s, p)}</b> <span className="pill">invited</span>
            <div className="mute">Waiting to accept</div>
          </div>
          {admin && <button className="linkbtn" disabled={busy} onClick={() => void act(() => account.removeMember(gid, p), 'Invite cancelled')}>Cancel</button>}
        </div>
      ))}

      {admin && (
        <>
          <label className="f">Add someone</label>
          <div className="row">
            <input placeholder="@tag to invite, or a name" maxLength={30} value={add} onChange={(e) => setAdd(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void invite()} aria-label="Add someone by tag or name" />
            <button className="secondary" style={{ width: 92, padding: 11 }} disabled={busy} onClick={() => void invite()}>Add</button>
          </div>
          <div className="mute" style={{ marginTop: 4 }}>A friend with an account gets an invite and joins once they accept.</div>
        </>
      )}

      {(l.requests ?? []).length > 0 && (
        <>
          <label className="f">Waiting to join</label>
          {(l.requests ?? []).map((r) => (
            <div className="row" style={{ padding: '6px 0', flexWrap: 'wrap' }} key={r.pid}>
              <Avatar pid={r.pid} size={32} />
              <div className="grow" style={{ minWidth: 120 }}>
                <b>{r.name}</b> {r.tag && <span className="pill">@{r.tag}</span>}
                <div className="mute">Opened the group link</div>
              </div>
              <button className="linkbtn" disabled={busy} onClick={() => void act(() => account.decideJoin(gid, r.pid, true), `${r.name} joined`)}>Approve</button>
              <button className="linkbtn" disabled={busy} onClick={() => void act(() => account.decideJoin(gid, r.pid, false), 'Request declined')}>Deny</button>
            </div>
          ))}
        </>
      )}

      <label className="f">Group link</label>
      {link ? (
        <>
          <div className="linkbox">
            <input readOnly value={link} aria-label="Group link" />
            <button className="secondary" onClick={() => void copy(link, 'Link copied')}>Copy</button>
          </div>
          <div className="mute" style={{ marginTop: 4 }}>Anyone can share this. People who open it can only ask to join; an admin approves each one.</div>
          {admin && (
            <div className="row" style={{ marginTop: 6 }}>
              <button className="linkbtn" disabled={busy} onClick={() => void act(() => account.setLink(gid, true), 'New link made. The old one stopped working.')}>Make a new link</button>
              <button className="linkbtn" disabled={busy} onClick={() => void act(() => account.setLink(gid, false), 'Group link turned off')}>Turn off</button>
            </div>
          )}
        </>
      ) : admin ? (
        <>
          <div className="mute">The link is off. Turn it on to let people ask to join.</div>
          <button className="secondary" disabled={busy} onClick={() => void act(() => account.setLink(gid, true), 'Group link is on')}>Turn on group link</button>
        </>
      ) : (
        <div className="mute">The link is off. An admin can turn it on.</div>
      )}

      <div style={{ height: 14 }} />
      {panel?.kind === 'leave' && (
        <div className="card">
          {(() => {
            const check = removalCheck(l, ME)
            return check.ok ? (
              <>
                <b>Leave {name}?</b>
                <p className="mute">You lose access to the group. Your old bills stay for everyone else.</p>
                <button className="primary" disabled={busy} onClick={() => void leave()}>Leave group</button>
              </>
            ) : (
              <>
                <b>{check.net > 0 ? `You are owed ${fmt(check.net)}` : `You owe ${fmt(-check.net)}`}</b>
                <p className="mute">Settle up before you leave, so nobody is left with a loose end.</p>
                <button className="primary" onClick={() => sheet.open('Record payment', (c) => <PaySheet gid={gid} close={c} />)}>Record a payment</button>
              </>
            )
          })()}
          <div style={{ height: 8 }} />
          <button className="secondary" onClick={() => setPanel(null)}>Cancel</button>
        </div>
      )}
      {panel?.kind === 'transfer' && (
        <div className="card">
          <b>Hand over ownership</b>
          <p className="mute">The new owner runs the group. You become an admin and can then leave.</p>
          {lines.filter((m) => !m.isYou && !m.contact).map((m) => (
            <button key={m.pid} className="secondary" style={{ marginBottom: 8 }} disabled={busy} onClick={() => void transfer(m)}>{m.name}</button>
          ))}
          {!lines.some((m) => !m.isYou && !m.contact) && <div className="mute">Invite someone with an account first.</div>}
          <button className="secondary" onClick={() => setPanel(null)}>Cancel</button>
        </div>
      )}
      {panel?.kind === 'delete' && (
        <div className="card">
          <b>Delete {name} for everyone?</b>
          <p className="mute">All its bills, payments and lists disappear for every member. This can't be undone.</p>
          <button className="primary" style={{ background: 'var(--red)', borderColor: 'var(--red)', color: '#fff' }} onClick={destroy}>Delete group</button>
          <div style={{ height: 8 }} />
          <button className="secondary" onClick={() => setPanel(null)}>Keep it</button>
        </div>
      )}
      {!panel && (
        <>
          {owner ? (
            <>
              <button className="secondary" onClick={() => setPanel({ kind: 'transfer' })}>Hand over ownership</button>
              <div style={{ height: 8 }} />
              <button className="secondary danger" onClick={() => setPanel({ kind: 'delete' })}>Delete group</button>
            </>
          ) : (
            <button className="secondary danger" onClick={() => setPanel({ kind: 'leave' })}>Leave group</button>
          )}
        </>
      )}
    </>
  )
}

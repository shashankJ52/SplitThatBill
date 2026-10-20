import { useState } from 'react'
import * as A from '../data/actions'
import { useAccount, useAccountMode } from '../data/account'
import { useAppState, useStore } from '../data/store'
import { isShared } from '../domain/membership'
import { ledgerById, ledgerName, pairBalance, pairInGroup, realGroups } from '../domain/selectors'
import { ago, fmt, uid } from '../domain/util'
import { Avatar } from '../ui/bits'
import { useToast } from '../ui/Toast'

const mention = (tag: string | undefined, name: string) => (tag ? `@${tag}` : name)

/** Friendly reminder (or heads-up) to one person, for one group or for everything between you. */
export function RemindSheet({ pid, gid, close }: { pid: string; gid: string | null; close: () => void }) {
  const s = useAppState()
  const store = useStore()
  const toast = useToast()
  const account = useAccount()
  const live = useAccountMode() === 'cloud'
  const g = gid ? ledgerById(s, gid) : undefined
  const person = s.people[pid]
  const pr = pairBalance(s, pid)
  const a = g ? pairInGroup(g, pid) : pr.tot
  const where = g ? (g.name ?? 'this group') : 'all your splits'
  const who = mention(person.tag, person.name)
  const initial = !a
    ? ''
    : a > 0
      ? `Hey ${who} 👋 quick, friendly nudge: you owe me ${fmt(a)} ${g ? `for ${g.name}` : 'across our splits'}. No rush at all, whenever works for you. Thanks!`
      : `Hey ${who}, just a heads-up: I haven't forgotten the ${fmt(-a)} I owe you${g ? ` for ${g.name}` : ''}. Sending it over soon!`
  const [text, setText] = useState(initial)
  const last = s.sent.filter((x) => x.to === pid && (x.gid ?? null) === (gid ?? null)).sort((x, y) => y.ts - x.ts)[0]
  const nm = person.name

  const send = async () => {
    if (live && account) {
      // with a real account the reminder goes through the server, in the group where you share the most
      const via = g ?? realGroups(s).filter((x) => isShared(x) && x.members.includes(pid)).sort((x, y) => Math.abs(pairInGroup(y, pid)) - Math.abs(pairInGroup(x, pid)))[0]
      if (!via) return toast(`You and ${nm} do not share a group that can carry a reminder yet.`)
      const r = await account.sendReminder(via.id, pid, Math.abs(g ? a : pairInGroup(via, pid)) || Math.abs(a), text.trim())
      if (r.err) return toast(r.err)
      close()
      return toast(`Reminder sent to ${nm}. Only they will see it.`)
    }
    store.update((st) => A.sendReminder(st, { id: uid('s'), to: pid, gid, amt: a, text: text.trim(), ts: Date.now() }))
    close()
    toast(`Reminder sent to ${nm}. Only they will see it.`)
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      toast('Message copied')
    } catch {
      toast('Copy blocked. Select the text manually.')
    }
  }
  const wa = () => window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener')

  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <Avatar pid={pid} size={44} />
        <div className="grow">
          <div className="gname">{nm}</div>
          <div className="mute">{a > 0 ? 'owes you' : a < 0 ? 'you owe' : 'settled up'} · {where}</div>
        </div>
        <div className="gname" style={{ color: a > 0 ? 'var(--green-t)' : a < 0 ? 'var(--red-t)' : 'var(--mute)' }}>{fmt(Math.abs(a))}</div>
      </div>
      {!g && pr.parts.length > 1 && (
        <div className="card lines" style={{ display: 'block', marginBottom: 10 }}>
          {pr.parts.map((x) => (
            <div key={x.ledger.id}>
              <span>{ledgerName(s, x.ledger as never)}</span>
              <span style={{ color: `var(--${x.amt > 0 ? 'green-t' : 'red-t'})` }}>{x.amt > 0 ? 'owes you ' : 'you owe '}{fmt(Math.abs(x.amt))}</span>
            </div>
          ))}
        </div>
      )}
      {!a ? (
        <>
          <div className="bar ok">You two are settled up{g ? ' in this group' : ''}.</div>
          <button className="secondary" onClick={close}>Close</button>
        </>
      ) : (
        <>
          <label className="f" htmlFor="rm-text" style={{ marginTop: 0 }}>Message (optional)</label>
          <textarea id="rm-text" rows={4} maxLength={280} value={text} onChange={(e) => setText(e.target.value)} aria-describedby="rm-note" />
          <div className="mute" id="rm-note" style={{ marginTop: 6 }}>
            {person.user ? `🔒 Only ${nm} will see this, in their alerts.${g ? ` Nobody else in ${where}.` : ''}` : `${nm} isn't on the app yet, so copy the message or send it on WhatsApp.`}
          </div>
          {last && <div className="bar info" style={{ marginTop: 10 }}>You reminded {nm} {ago(last.ts)}.</div>}
          <div style={{ height: 12 }} />
          {person.user ? (
            <button className="primary" onClick={() => void send()}>Send reminder</button>
          ) : (
            <>
              <button className="primary" onClick={wa}>Send on WhatsApp</button>
              <div style={{ height: 10 }} />
              <button className="secondary" onClick={copy}>Copy message</button>
            </>
          )}
          <div style={{ height: 10 }} />
          <button className="secondary" onClick={close}>Cancel</button>
        </>
      )}
    </>
  )
}


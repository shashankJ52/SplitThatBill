import { useState } from 'react'
import * as A from '../data/actions'
import { useAppState, useStore } from '../data/store'
import { others, realGroups, letterOf } from '../domain/selectors'
import { uid } from '../domain/util'
import { Avatar, Bullet, Empty } from '../ui/bits'
import { useToast } from '../ui/Toast'
import { ME } from '../domain/types'

export type PickMode = 'g' | 'p' | 'f'

/** Search all groups or people. Mode "f" (find) opens a person; "g" and "p" choose who to split with. */
export function PickSheet({ mode, onPick, close }: { mode: PickMode; onPick: (value: string) => void; close: () => void }) {
  const s = useAppState()
  const store = useStore()
  const toast = useToast()
  const [q, setQ] = useState('')
  const [add, setAdd] = useState('')
  const t = q.trim().toLowerCase()

  const rows =
    mode === 'g'
      ? realGroups(s)
          .filter((g) => (g.name ?? '').toLowerCase().includes(t))
          .map((g) => ({ key: `g:${g.id}`, icon: <Bullet letter={letterOf(g.name ?? '?')} color={g.color ?? '#A7A9AC'} size={38} />, label: g.name ?? '', sub: `${g.members.length} people` }))
      : others(s)
          .filter((p) => s.people[p].name.toLowerCase().includes(t) || (t.startsWith('@') && t.length > 1 && (s.people[p].tag ?? '').toLowerCase().includes(t.slice(1))))
          .map((p) => ({ key: `p:${p}`, icon: <Avatar pid={p} size={38} />, label: s.people[p].name, sub: s.people[p].user ? `@${s.people[p].tag ?? ''}` : 'Not on the app' }))

  const addPerson = () => {
    const r = A.addPersonFromInput(store.get(), add, [ME], uid('p'))
    if (r.err || !r.id) return toast(r.err ?? 'Could not add')
    store.update(() => r.state)
    close()
    onPick(`p:${r.id}`)
  }

  return (
    <>
      <input placeholder="Search" maxLength={30} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" autoFocus />
      <div style={{ marginTop: 10 }}>
        {rows.length ? (
          rows.map((r) => (
            <button key={r.key} className="card tap row" style={{ width: '100%', textAlign: 'left' }} onClick={() => { close(); onPick(r.key) }}>
              {r.icon}
              <div className="grow">
                <b>{r.label}</b>
                <div className="mute">{r.sub}</div>
              </div>
            </button>
          ))
        ) : (
          <Empty title="No matches" small>{mode === 'g' ? 'Try another name or create a group.' : 'Add them by name or @usertag below.'}</Empty>
        )}
      </div>
      {mode !== 'g' && (
        <>
          <label className="f">Not listed?</label>
          <div className="row">
            <input placeholder="Name or @usertag" maxLength={30} value={add} onChange={(e) => setAdd(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addPerson()} aria-label="Add by name or usertag" />
            <button className="secondary" onClick={addPerson} style={{ width: 92, padding: 11 }}>Add</button>
          </div>
        </>
      )}
    </>
  )
}

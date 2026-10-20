import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as A from '../data/actions'
import { useAccountMode } from '../data/account'
import { useAppState, useStore } from '../data/store'
import { isShared } from '../domain/membership'
import { ledgerById, personName, realGroups } from '../domain/selectors'
import { ME } from '../domain/types'
import { COLORS, uid } from '../domain/util'
import { Avatar, Bullet } from '../ui/bits'
import { useAddPerson } from '../ui/useAddPerson'
import { useToast } from '../ui/Toast'

/** Create a group, or edit one (name, color, simplify debts, people). */
export function GroupSheet({ gid, onCreated, close }: { gid?: string; onCreated?: (id: string) => void; close: () => void }) {
  const store = useStore()
  const s = useAppState()
  const toast = useToast()
  const addByInput = useAddPerson()
  const live = useAccountMode() === 'cloud'
  const nav = useNavigate()
  const existing = gid ? ledgerById(s, gid) : undefined
  const shared = !!existing && isShared(existing)
  const [name, setName] = useState(existing?.name ?? '')
  const [color, setColor] = useState(() => existing?.color ?? COLORS[Math.floor(Math.random() * COLORS.length)])
  const [simplify, setSimplify] = useState(existing?.simplify ?? true)
  const [members, setMembers] = useState<string[]>(existing?.members ?? [ME])
  const [add, setAdd] = useState('')
  const [nameBad, setNameBad] = useState(false)
  const [delArm, setDelArm] = useState(false)

  const addMember = async () => {
    const r = await addByInput(add, members)
    if (r.err || !r.id) return toast(r.err ?? 'Could not add')
    setMembers([...members, r.id as string])
    setAdd('')
  }
  const removeMember = (id: string) => {
    if (existing && !A.canRemoveMember(existing, id)) return toast(`${personName(s, id)} still has a balance. Settle up first.`)
    setMembers(members.filter((m) => m !== id))
  }
  const save = () => {
    const n = name.trim()
    if (!n) {
      setNameBad(true)
      return toast('Give the group a name')
    }
    if (realGroups(s).some((g) => g.id !== gid && (g.name ?? '').toLowerCase() === n.toLowerCase())) return toast('You already have a group with that name')
    if (existing) {
      store.update((st) => A.updateGroup(st, existing.id, { name: n, color, simplify, members }))
      toast('Group updated')
    } else {
      const id = uid('g')
      store.update((st) => A.createGroup(st, { id, name: n, color, simplify, members }))
      toast('Group created')
      onCreated?.(id)
    }
    close()
  }
  const remove = () => {
    if (!existing) return
    if (!delArm) return setDelArm(true)
    store.update((st) => A.deleteGroup(st, existing.id))
    close()
    toast('Group deleted')
    nav('/groups', { replace: true })
  }

  return (
    <>
      <label className="f" htmlFor="sh-name">Group name</label>
      <input id="sh-name" className={nameBad ? 'bad' : ''} maxLength={24} value={name} placeholder="e.g. Ski trip" onChange={(e) => { setName(e.target.value); setNameBad(false) }} />
      <label className="f">Line color</label>
      <div className="swatches">
        {COLORS.map((c) => (
          <button key={c} onClick={() => setColor(c)} aria-label={`Color ${c}`} aria-pressed={c === color}>
            <Bullet letter={(name || '?').charAt(0).toUpperCase()} color={c} size={34} ring={c === color} />
          </button>
        ))}
      </div>
      <label className="f">Debts</label>
      <label className="switch">
        <input type="checkbox" checked={simplify} onChange={(e) => setSimplify(e.target.checked)} />
        <span>
          <b>Simplify debts</b>
          <div className="mute">On: fewest payments to settle up. Off: shows who owes whom directly.</div>
        </span>
      </label>
      {!shared && <label className="f">People</label>}
      {!shared && live && <div className="mute" style={{ marginBottom: 6 }}>Add friends with an account by @tag. They get an invite and join once they accept. Add anyone else by name.</div>}
      {!shared && members.map((m) => (
        <div className="row" style={{ padding: '5px 0' }} key={m}>
          <Avatar pid={m} size={32} />
          <div className="grow">
            <b>{personName(s, m)}</b> {s.people[m]?.user ? s.people[m]?.tag && <span className="pill">@{s.people[m].tag}</span> : <span className="pill">local</span>}
          </div>
          {m !== ME && <button className="del" onClick={() => removeMember(m)} aria-label={`Remove ${personName(s, m)}`}>✕</button>}
        </div>
      ))}
      {!shared && <div className="row" style={{ marginTop: 8 }}>
        <input placeholder="Name or @usertag" maxLength={30} value={add} onChange={(e) => setAdd(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void addMember()} aria-label="Add a person by name or usertag" />
        <button className="secondary" onClick={() => void addMember()} style={{ width: 92, padding: 11 }}>Add</button>
      </div>}
      <div style={{ height: 16 }} />
      <button className="primary" onClick={save}>{existing ? 'Save changes' : 'Create group'}</button>
      {existing && !shared && (
        <>
          <div style={{ height: 10 }} />
          <button className="secondary danger" onClick={remove}>{delArm ? 'Tap again to delete the group and its bills' : 'Delete group'}</button>
        </>
      )}
    </>
  )
}

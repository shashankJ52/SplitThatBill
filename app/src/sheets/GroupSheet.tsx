import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as A from '../data/actions'
import { useAccountMode } from '../data/account'
import { useAppState, useStore } from '../data/store'
import { isShared } from '../domain/membership'
import { currencyOf, defaultCurrency, ledgerById, personName, realGroups } from '../domain/selectors'
import { ME } from '../domain/types'
import { GROUP_ICONS } from '../domain/groupIcons'
import { COLORS, uid } from '../domain/util'
import { Avatar, Bullet } from '../ui/bits'
import { CurrencyPicker } from '../ui/CurrencyPicker'
import { CloseIcon } from '../ui/icons'
import { TypeToConfirm } from '../ui/TypeToConfirm'
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
  const [icon, setIcon] = useState(existing?.icon ?? '')
  const [simplify, setSimplify] = useState(existing?.simplify ?? true)
  const [currency, setCurrency] = useState(existing ? currencyOf(s, existing) : defaultCurrency(s))
  const [members, setMembers] = useState<string[]>(existing?.members ?? [ME])
  const [add, setAdd] = useState('')
  const [nameBad, setNameBad] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

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
      store.update((st) => A.updateGroup(st, existing.id, { name: n, color, icon, simplify, members, currency }))
      toast('Group updated')
    } else {
      const id = uid('g')
      store.update((st) => A.createGroup(st, { id, name: n, color, icon, simplify, members, currency }))
      toast('Group created')
      onCreated?.(id)
    }
    close()
  }
  const remove = () => {
    if (!existing) return
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
            <Bullet letter={icon || (name || '?').charAt(0).toUpperCase()} color={c} size={34} ring={c === color} />
          </button>
        ))}
      </div>
      <label className="f">Icon</label>
      <div className="icons">
        <button type="button" className="icon-pick letter" onClick={() => setIcon('')} aria-pressed={!icon} aria-label="First letter of the name">
          <Bullet letter={(name || 'A').charAt(0).toUpperCase()} color={color} size={34} ring={!icon} />
        </button>
        {GROUP_ICONS.map((t) => (
          <div key={t.theme} className="icon-theme">
            <span className="mute">{t.theme}</span>
            <div className="icon-row">
              {t.icons.map((e) => (
                <button key={e} type="button" className="icon-pick" onClick={() => setIcon(e)} aria-pressed={icon === e} aria-label={`Icon ${e}`}>
                  <Bullet letter={e} color={color} size={34} ring={icon === e} />
                </button>
              ))}
            </div>
          </div>
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
      <label className="f">Currency</label>
      <CurrencyPicker value={currency} onChange={setCurrency} />
      <div className="mute" style={{ marginTop: 4 }}>
        {existing && existing.bills.length + existing.payments.length > 0 ? 'Changing this only changes the symbol. Amounts already entered are not converted.' : 'Every amount in this group is written in this currency.'}
      </div>
      {!shared && <label className="f">People</label>}
      {!shared && live && <div className="mute" style={{ marginBottom: 6 }}>Add friends with an account by @tag. They get an invite and join once they accept. Add anyone else by name.</div>}
      {!shared && members.map((m) => (
        <div className="row" style={{ padding: '5px 0' }} key={m}>
          <Avatar pid={m} size={32} />
          <div className="grow">
            <b>{personName(s, m)}</b> {s.people[m]?.user ? s.people[m]?.tag && <span className="pill">@{s.people[m].tag}</span> : <span className="pill">local</span>}
          </div>
          {m !== ME && <button className="del" onClick={() => removeMember(m)} aria-label={`Remove ${personName(s, m)}`}><CloseIcon /></button>}
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
          {confirmDelete ? (
            <TypeToConfirm
              title={`Delete ${existing.name ?? 'this group'}?`}
              body="All its bills, payments and lists are deleted. This can't be undone."
              word={existing.name ?? 'delete'}
              confirmLabel="Delete group"
              onConfirm={remove}
              onCancel={() => setConfirmDelete(false)}
            />
          ) : (
            <button className="secondary danger" onClick={() => setConfirmDelete(true)}>Delete group</button>
          )}
        </>
      )}
    </>
  )
}

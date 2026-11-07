import { useState } from 'react'
import * as A from '../data/actions'
import { useAppState, useStore } from '../data/store'
import { ledgerById, realGroups, groupGlyph } from '../domain/selectors'
import type { ListItem, NoteList } from '../domain/types'
import { ME } from '../domain/types'
import { uid } from '../domain/util'
import { Avatar, Bullet } from '../ui/bits'
import { Dropdown, type Option } from '../ui/Dropdown'
import { CloseIcon } from '../ui/icons'
import { useToast } from '../ui/Toast'

/** Create or edit a note or list: a name, where it lives, a checklist and an optional memo. */
export function NoteSheet({ ctx, gid, id, title: startTitle, close }: { ctx: 'n' | 'g'; gid: string | null; id?: string; title?: string; close: () => void }) {
  const s = useAppState()
  const store = useStore()
  const toast = useToast()
  const existing = id ? (ctx === 'n' ? s.notes : (ledgerById(s, gid as string)?.lists ?? [])).find((n) => n.id === id) : undefined
  const [title, setTitle] = useState(existing?.title ?? startTitle ?? '')
  const [memo, setMemo] = useState(existing?.memo ?? '')
  const [items, setItems] = useState<ListItem[]>(existing?.items ?? [])
  const [dest, setDest] = useState<string>(ctx === 'n' ? 'n' : `g:${gid}`)
  const [add, setAdd] = useState('')
  const [delArm, setDelArm] = useState(false)
  const word = ctx === 'n' ? 'note' : 'list'

  const options: Option<string>[] = [
    { value: 'n', label: 'Just me', sub: '· personal note', icon: <Avatar pid={ME} size={28} /> },
    ...realGroups(s).map((g) => ({ value: `g:${g.id}`, label: g.name ?? '', sub: '· group list', icon: <Bullet letter={groupGlyph(g)} color={g.color ?? '#A7A9AC'} size={28} /> })),
  ]

  const addItem = () => {
    const t = add.trim()
    if (!t) return toast('Type an item first')
    setItems([...items, { id: uid(), t, done: false, doneBy: null }])
    setAdd('')
  }
  const save = () => {
    const t = title.trim()
    if (!t && !memo.trim() && !items.length) return toast('Write something first')
    const note: NoteList = { id: existing?.id ?? uid('m'), title: t || 'Untitled', memo: memo.trim(), items, ts: Date.now() }
    store.update((st) => A.saveNote(st, note, existing ? { ctx, gid } : null, dest))
    close()
    toast(dest === 'n' ? 'Saved to your notes' : `Saved to ${ledgerById(store.get(), dest.slice(2))?.name} › Lists`)
  }
  const remove = () => {
    if (!existing) return
    if (!delArm) return setDelArm(true)
    store.update((st) => A.deleteNote(st, { ctx, gid }, existing.id))
    close()
    toast('Deleted')
  }

  return (
    <>
      <label className="f" htmlFor="nt-title">Name</label>
      <input id="nt-title" maxLength={40} value={title} placeholder="e.g. Costco run" onChange={(e) => setTitle(e.target.value)} autoFocus />
      <label className="f">Save to</label>
      <Dropdown label="Save to" value={dest} options={options} onChange={setDest} />
      <label className="f">Checklist</label>
      {items.map((x) => (
        <div className="row" style={{ padding: '4px 0' }} key={x.id}>
          <button className={`chk${x.done ? ' on' : ''}`} aria-label={`${x.done ? 'Untick' : 'Tick'} ${x.t}`} aria-pressed={x.done} onClick={() => setItems(items.map((i) => (i.id === x.id ? { ...i, done: !i.done } : i)))}>{x.done ? '✓' : ''}</button>
          <span className={`grow${x.done ? ' done' : ''}`}>{x.t}</span>
          <button className="del" aria-label={`Remove ${x.t}`} onClick={() => setItems(items.filter((i) => i.id !== x.id))}><CloseIcon /></button>
        </div>
      ))}
      <div className="row" style={{ marginTop: 6 }}>
        <input placeholder="Add an item" maxLength={60} value={add} aria-label="New checklist item" onChange={(e) => setAdd(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addItem()} />
        <button className="secondary" onClick={addItem} style={{ width: 92, padding: 11 }}>Add</button>
      </div>
      <label className="f" htmlFor="nt-memo">Memo (optional)</label>
      <textarea id="nt-memo" rows={4} maxLength={1000} value={memo} placeholder="Anything else to remember" onChange={(e) => setMemo(e.target.value)} />
      <div style={{ height: 16 }} />
      <button className="primary" onClick={save}>Save</button>
      {existing && (
        <>
          <div style={{ height: 10 }} />
          <button className="secondary danger" onClick={remove}>{delArm ? 'Tap again to delete' : `Delete ${word}`}</button>
        </>
      )}
    </>
  )
}

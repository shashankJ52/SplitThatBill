import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Screen } from '../../app/Screen'
import { useAppState, useStore } from '../../data/store'
import * as D from '../../domain/draft'
import { letterOf, ledgerById, personName, realGroups, recentGroups, recentPeople, others } from '../../domain/selectors'
import { ME } from '../../domain/types'
import { useAddPerson } from '../../ui/useAddPerson'
import { useFlow } from '../../flow/FlowProvider'
import { GroupSheet } from '../../sheets/GroupSheet'
import { PickSheet } from '../../sheets/PickSheet'
import { Avatar, Bullet } from '../../ui/bits'
import { useSheet } from '../../ui/Sheet'
import { useToast } from '../../ui/Toast'

const MAX_UPLOAD = 15 * 1024 * 1024

export function Capture() {
  const { draft: d, set, begin } = useFlow()
  const loc = useLocation()
  const nav = useNavigate()
  const s = useAppState()
  const store = useStore()
  const sheet = useSheet()
  const toast = useToast()
  const addByInput = useAddPerson()
  const [newName, setNewName] = useState('')
  const [bad, setBad] = useState(false)
  const want = (loc.state as { target?: string | null } | null)?.target

  useEffect(() => {
    if (!d) begin(want)
  }, [d, begin, want])
  if (!d) return null

  const sel = d.target
  const rg = recentGroups(s, 5)
  const rp = recentPeople(s, 5)
  if (sel.startsWith('g:')) {
    const g = ledgerById(s, sel.slice(2))
    if (g && !rg.includes(g)) rg.unshift(g)
  }
  if (sel.startsWith('p:') && !rp.includes(sel.slice(2))) rp.unshift(sel.slice(2))

  const pick = (t: string) => set((x) => D.setTarget(store.get(), x, t))
  const selGroup = sel.startsWith('g:') ? ledgerById(s, sel.slice(2)) : null

  /** Turn "Someone new" into a real person before moving on. Returns the draft to continue with. */
  const settle = async (): Promise<D.Draft | null> => {
    if (d.target !== 'new') return d
    const r = await addByInput(newName, [ME])
    if (r.err || !r.id) {
      toast(r.err ?? 'Enter a name or @usertag')
      setBad(true)
      return null
    }
    return D.setTarget(store.get(), d, `p:${r.id}`)
  }
  const proceed = async () => {
    let cur = await settle()
    if (!cur) return
    if (cur.manual) cur = D.loadSample(cur)
    const next = cur
    set(() => next)
    nav('/scan/privacy')
  }
  const manual = async () => {
    const cur = await settle()
    if (!cur) return
    const next = D.startManual(cur)
    set(() => next)
    nav('/scan/review')
  }
  const upload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!/^(image\/|application\/pdf)/.test(f.type)) return toast('Choose a photo or a PDF')
    if (f.size > MAX_UPLOAD) return toast('That file is over 15 MB. Try a smaller photo.')
    void proceed()
  }

  return (
    <Screen id="v-capture">
      <div className="vhead"><h1 className="display">Scan receipt</h1></div>
      <div className="vbody">
        <label className="f" style={{ marginTop: 0 }}>Split with</label>
        <div className="mute" style={{ marginBottom: 6 }}>
          {selGroup ? (
            <div className="row">
              <Bullet letter={letterOf(selGroup.name ?? '?')} color={selGroup.color ?? '#A7A9AC'} size={30} />
              <b style={{ color: 'var(--fg)' }}>{selGroup.name}</b>
              <span>· {selGroup.members.length} people</span>
            </div>
          ) : sel.startsWith('p:') ? (
            <div className="row">
              <Avatar pid={sel.slice(2)} size={30} />
              <b style={{ color: 'var(--fg)' }}>1-1 with {personName(s, sel.slice(2))}</b>
            </div>
          ) : (
            "Pick who you're splitting with, or add someone new."
          )}
        </div>
        <h2 style={{ margin: '10px 0 8px' }}>Recent groups</h2>
        <div>
          {rg.map((g) => (
            <button key={g.id} className={`fchip${sel === `g:${g.id}` ? ' on' : ''}`} onClick={() => pick(`g:${g.id}`)}>
              <Bullet letter={letterOf(g.name ?? '?')} color={g.color ?? '#A7A9AC'} size={28} />
              {g.name}
            </button>
          ))}
          {realGroups(s).length > 5 && (
            <button className="fchip plain" onClick={() => sheet.open('All groups', (close) => <PickSheet mode="g" onPick={pick} close={close} />)}>All groups…</button>
          )}
          <button className="fchip plain" onClick={() => sheet.open('New group', (close) => <GroupSheet onCreated={(id) => pick(`g:${id}`)} close={close} />)}>+ New group</button>
        </div>
        <h2 style={{ margin: '6px 0 8px' }}>Just two of you (1-1)</h2>
        <div>
          {rp.map((p) => (
            <button key={p} className={`fchip${sel === `p:${p}` ? ' on' : ''}`} onClick={() => pick(`p:${p}`)}>
              <Avatar pid={p} size={28} />
              {personName(s, p)}
            </button>
          ))}
          {others(s).length > 5 && (
            <button className="fchip plain" onClick={() => sheet.open('All people', (close) => <PickSheet mode="p" onPick={pick} close={close} />)}>All people…</button>
          )}
          <button className={`fchip plain${sel === 'new' ? ' on' : ''}`} onClick={() => pick('new')}>+ Someone new</button>
        </div>
        {sel === 'new' && (
          <div>
            <label className="f" htmlFor="cap-new">Name or @usertag</label>
            <input id="cap-new" className={bad ? 'bad' : ''} maxLength={30} placeholder="e.g. Marie or @marie" value={newName} onChange={(e) => { setNewName(e.target.value); setBad(false) }} />
          </div>
        )}
        <div className="empty" style={{ marginTop: 10, padding: '28px 14px' }}>
          <b>Camera preview</b>Real scanning is not connected yet. Any photo loads a sample receipt.
        </div>
        <button className="primary" onClick={() => void proceed()}>Take photo (sample receipt)</button>
        <div style={{ height: 10 }} />
        <label className="secondary" style={{ display: 'block', textAlign: 'center', padding: 15, border: '2px solid var(--fg)', borderRadius: 999, fontWeight: 700, cursor: 'pointer' }}>
          Upload a bill
          <input type="file" accept="image/*,application/pdf" hidden onChange={upload} />
        </label>
        <div style={{ height: 10 }} />
        <button className="secondary" onClick={() => void manual()}>No receipt? Enter items yourself</button>
        <p className="mute">Receipt reading (OCR) comes once the backend is connected. Your photo is never stored.</p>
      </div>
    </Screen>
  )
}

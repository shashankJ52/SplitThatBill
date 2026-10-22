import { useState } from 'react'
import { useDraftMoney } from '../../flow/useDraftMoney'
import { useNavigate } from 'react-router-dom'
import { Screen } from '../../app/Screen'
import * as A from '../../data/actions'
import { useAppState, useStore } from '../../data/store'
import * as D from '../../domain/draft'
import { ledgerById, personName } from '../../domain/selectors'
import { assignText, ItemPanel } from '../../flow/ItemPanel'
import { useFlow } from '../../flow/FlowProvider'
import { withDraft } from '../../flow/withDraft'
import { WholeSheet } from '../../sheets/WholeSheet'
import { Empty, Seg } from '../../ui/bits'
import { FlowFooter } from '../../ui/FlowFooter'
import { useSheet } from '../../ui/Sheet'
import { useAddPerson } from '../../ui/useAddPerson'
import { useToast } from '../../ui/Toast'

export const Assign = withDraft(function Assign({ d }: { d: D.Draft }) {
  const fmt = useDraftMoney(d)
  const { set } = useFlow()
  const nav = useNavigate()
  const s = useAppState()
  const store = useStore()
  const sheet = useSheet()
  const toast = useToast()
  const addByInput = useAddPerson()
  const [mode, setMode] = useState<'item' | 'person'>('item')
  const [sel, setSel] = useState<number | null>(null)
  const [selP, setSelP] = useState(d.people[0])
  const [newp, setNewp] = useState('')
  const name = (p: string) => personName(s, p)
  const un = D.unassigned(d).length
  const person = selP && d.people.includes(selP) ? selP : d.people[0]

  const pickItem = (it: D.Draft['items'][number]) => {
    if (mode === 'item') return setSel(sel === it.id ? null : it.id)
    if (it.a.mode === 'por') return toast('That item uses portions. Edit it in By item.')
    set((x) => D.toggleEven(x, it.id, person))
  }
  const addPerson = async () => {
    // people with an account are invited from group settings; here only contacts can be added on the spot
    const r = await addByInput(newp, d.people, { contactsOnly: true })
    if (r.err || !r.id) return toast(r.err ?? 'Could not add')
    const id = r.id
    store.update((st) => {
      const g = d.gid ? ledgerById(st, d.gid) : undefined
      return g && !g.members.includes(id) ? A.updateGroup(st, g.id, { members: [...g.members, id] }) : st
    })
    set((x) => ({ ...x, people: [...x.people, id] }))
    setNewp('')
  }
  const openWhole = () => sheet.open('Split the whole bill', (close) => <WholeSheet d={d} apply={(n) => set(() => n)} close={close} />)

  return (
    <Screen id="v-assign">
      <div className="vhead">
        <h1 className="display">Who had what?</h1>
        <Seg label="Assign by" className="mode" value={mode} options={[{ value: 'item', label: 'By item' }, { value: 'person', label: 'By person' }]} onChange={setMode} />
        <div className="btnrow" style={{ margin: '0 0 8px' }}>
          <button className="primary" style={{ padding: 11 }} onClick={openWhole}>Split whole bill</button>
        </div>
        {d.fixed && (
          <div className="bar info">
            Custom amounts: {Object.keys(d.fixed).map((p) => `${name(p)} ${fmt((d.fixed as Record<string, number>)[p])}`).join(' · ')}{' '}
            <button className="linkbtn" onClick={openWhole}>Edit</button>{' '}
            <button className="linkbtn" onClick={() => { set(D.clearWhole); toast('Custom amounts removed') }}>Remove</button>
          </div>
        )}
      </div>
      <div className="vbody">
        <div className="mute">{d.fixed ? '' : mode === 'item' ? 'Tap an item, then choose who had it. Use Portions for things like 4 colas shared unevenly.' : 'Pick a person, then tap everything they had.'}</div>
        {mode === 'person' && !d.fixed && (
          <div className="chips">
            {d.people.map((p) => (
              <button key={p} className={`chip${person === p ? ' on' : ''}`} aria-pressed={person === p} onClick={() => setSelP(p)}>
                {name(p)}
                {d.guests[p] ? ` +${d.guests[p]}` : ''}
                {s.people[p]?.user ? '' : ' · local'}
              </button>
            ))}
          </div>
        )}
        {d.kind === 'group' && !d.fixed && (
          <div className="row" style={{ marginBottom: 8 }}>
            <input placeholder="Add person or @usertag" maxLength={30} aria-label="Add person or @usertag" value={newp} onChange={(e) => setNewp(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), void addPerson())} />
            <button className="secondary" style={{ width: 92, padding: 11 }} onClick={() => void addPerson()}>Add</button>
          </div>
        )}
        <div id="alist">
          {d.fixed ? (
            <>
              <div className="bar ok">✓ Whole bill split by custom amounts</div>
              {d.items.map((i) => (
                <div className="card row" key={i.id}>
                  <div className="grow"><b>{i.qty > 1 ? `${i.qty}× ` : ''}{i.name}</b></div>
                  <b>{fmt(i.price)}</b>
                </div>
              ))}
            </>
          ) : (
            <>
              {un ? <div className="bar bad">{un} item{un > 1 ? 's' : ''} not fully assigned yet</div> : <div className="bar ok">✓ Everything assigned</div>}
              {d.items.length ? (
                d.items.map((i) => {
                  const isSel = mode === 'item' && sel === i.id
                  const hl = mode === 'person' && ((i.a.mode === 'even' && i.a.even.includes(person)) || (i.a.mode === 'por' && (i.a.por[person] || 0) > 0))
                  return (
                    <div className={`card${isSel || hl ? ' sel' : ''}${D.isAssigned(d, i) ? '' : ' un'}`} key={i.id}>
                      <div className="row tap" role="button" tabIndex={0} onClick={() => pickItem(i)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), pickItem(i))}>
                        <div className="grow">
                          <b>{i.qty > 1 ? `${i.qty}× ` : ''}{i.name}</b>
                          <div className="mute">{assignText(d, i, name)}{i.a.mode === 'por' ? ' · portions' : ''}</div>
                        </div>
                        <b>{fmt(i.price)}</b>
                      </div>
                      {isSel && <ItemPanel d={d} it={i} set={set} />}
                    </div>
                  )
                })
              ) : (
                <Empty title="No items to assign">Go back and add some.</Empty>
              )}
            </>
          )}
        </div>
      </div>
      <FlowFooter label="Continue" disabled={!D.canContinue(d, 'assign')} onClick={() => nav('/scan/details')} />
    </Screen>
  )
})

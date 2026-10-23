import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Screen } from '../app/Screen'
import * as A from '../data/actions'
import { useAppState, useStore } from '../data/store'
import { monthStats, personalLedger } from '../domain/selectors'
import { mLabel, nowKey, uid } from '../domain/util'
import { Bullet, Seg } from '../ui/bits'
import { useMoney } from '../ui/useMoney'
import { NoteSheet } from '../sheets/NoteSheet'
import { NoteCards } from '../ui/NoteCards'
import { useSheet } from '../ui/Sheet'
import { BillsTab, OverviewTab } from './GroupPage'

type Tab = 'bills' | 'overview' | 'lists'
const TABS: Tab[] = ['bills', 'overview', 'lists']

/** Your own page for spending that is not split with anyone: bills, an overview and lists. */
export function PersonalPage() {
  const s = useAppState()
  const store = useStore()
  const nav = useNavigate()
  const [sp, setSp] = useSearchParams()
  const l = personalLedger(s)
  const fmt = useMoney(l)

  // the ledger is made the first time the page opens
  useEffect(() => {
    if (!personalLedger(store.get())) store.update((st) => A.ensurePersonal(st, uid('g')).state)
  }, [store])
  if (!l) return null

  const tab: Tab = TABS.includes(sp.get('tab') as Tab) ? (sp.get('tab') as Tab) : 'bills'
  const month = nowKey()
  const spent = monthStats(l, month).tot
  const all = l.bills.reduce((a, b) => a + b.total, 0)
  // your personal lists are your own notes (the same ones as in Short notes)
  const oc = s.notes.reduce((a, n) => a + n.items.filter((x) => !x.done).length, 0)
  const label: Record<Tab, string> = { bills: 'Bills', overview: 'Overview', lists: `Lists${oc ? ` (${oc})` : ''}` }

  return (
    <Screen id="v-personal">
      <div className="vhead">
        <div className="row" style={{ margin: '2px 0 8px' }}>
          <Bullet letter={l.icon || '👤'} color={l.color ?? A.PERSONAL_COLOR} size={50} />
          <div className="grow">
            <div className="gname" style={{ fontSize: 26, lineHeight: 1.05 }}>Personal</div>
            <div className="mute">Just you. Nothing here is split.</div>
          </div>
        </div>
        <div className="sign" style={{ marginBottom: 8 }}>
          <div className="cols" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div><div className="lbl">You spent · {mLabel(month)}</div><div className="num">{fmt(spent)}</div></div>
            <div><div className="lbl">All time</div><div className="num">{fmt(all)}</div></div>
          </div>
        </div>
        <div className="btnrow" style={{ margin: '0 0 8px' }}>
          <button className="primary" onClick={() => nav('/scan', { state: { target: 'me' } })}>Add a bill</button>
        </div>
        <Seg value={tab} onChange={(v) => setSp({ tab: v }, { replace: true })} options={TABS.map((v) => ({ value: v, label: label[v] }))} label="Personal sections" />
      </div>
      <div className="vbody">
        {tab === 'bills' && <BillsTab gid={l.id} personal />}
        {tab === 'overview' && <OverviewTab gid={l.id} personal />}
        {tab === 'lists' && <PersonalLists />}
      </div>
    </Screen>
  )
}

/** Your own lists and notes, kept here as well as in Short notes. */
function PersonalLists() {
  const sheet = useSheet()
  const [q, setQ] = useState('')
  return (
    <>
      <div className="row" style={{ marginBottom: 10 }}>
        <input placeholder="Search your lists, or name a new one" maxLength={40} aria-label="Search lists" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="primary" style={{ width: 'auto', padding: '12px 18px', whiteSpace: 'nowrap' }} onClick={() => sheet.open('New list', (close) => <NoteSheet ctx="n" gid={null} title={q.trim()} close={close} />)}>+ Create</button>
      </div>
      <NoteCards ctx="n" gid={null} q={q} filter="n" />
    </>
  )
}

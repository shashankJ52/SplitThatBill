import { useRef, useState, type PointerEvent } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Screen } from '../app/Screen'
import { useAppState } from '../data/store'
import { filterActivity, groupTotals, ledgerActivity, ledgerById, groupGlyph, monthStats, monthsAsc, openCount, pairInGroup, personName, type ActivityKind } from '../domain/selectors'
import { ME } from '../domain/types'
import { mAdd, mLabel, nowKey } from '../domain/util'
import { useMoney } from '../ui/useMoney'
import { nets, transfers } from '../money'
import { GroupManageSheet } from '../sheets/GroupManageSheet'
import { GroupSheet } from '../sheets/GroupSheet'
import { isShared } from '../domain/membership'
import { useAccount } from '../data/account'
import { NoteSheet } from '../sheets/NoteSheet'
import { PaySheet } from '../sheets/PaySheet'
import { RemindSheet } from '../sheets/RemindSheet'
import { Avatar, Bullet, Empty, Seg } from '../ui/bits'
import { ActivityFilter } from '../ui/ActivityFilter'
import { BillCard, PayCard } from '../ui/BillCards'
import { CategoryChart, PeopleChart, TrendChart, type TrendState } from '../ui/charts'
import { MonthBar } from '../ui/MonthBar'
import { NoteCards } from '../ui/NoteCards'
import { useSheet } from '../ui/Sheet'
import { useUiState } from '../ui/uiState'

type Tab = 'bills' | 'overview' | 'balances' | 'lists'
const TABS: Tab[] = ['bills', 'overview', 'balances', 'lists']

export function GroupPage() {
  const { gid = '' } = useParams()
  const s = useAppState()
  const nav = useNavigate()
  const sheet = useSheet()
  const account = useAccount()
  const [sp, setSp] = useSearchParams()
  const g = ledgerById(s, gid)
  const fmt = useMoney(g)
  if (!g || g.kind !== 'group') return <Navigate to="/groups" replace />

  const tab: Tab = TABS.includes(sp.get('tab') as Tab) ? (sp.get('tab') as Tab) : 'bills'
  const t = groupTotals(g)
  const oc = openCount(g)
  const label: Record<Tab, string> = { bills: 'Bills', overview: 'Overview', balances: 'Balances', lists: `Lists${oc ? ` (${oc})` : ''}` }

  return (
    <Screen id="v-group">
      <div className="vhead">
        <div className="row" style={{ margin: '2px 0 8px' }}>
          <Bullet letter={groupGlyph(g)} color={g.color ?? '#A7A9AC'} size={50} />
          <div className="grow">
            <div className="gname" style={{ fontSize: 26, lineHeight: 1.05 }}>{g.name}</div>
            <div className="mute" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.members.map((m) => personName(s, m)).join(', ')}</div>
          </div>
          <button className="secondary" style={{ width: 44, padding: 9 }} aria-label="Group settings" onClick={() => sheet.open('Group settings', (close) => (isShared(g) && account ? <GroupManageSheet gid={g.id} close={close} /> : <GroupSheet gid={g.id} close={close} />))}>⚙</button>
        </div>
        <div className="sign" style={{ marginBottom: 8 }}>
          <div className="cols" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div><div className="lbl">You owe</div><div className="num r">{fmt(t.owe)}</div></div>
            <div><div className="lbl">Owed to you</div><div className="num g">{fmt(t.owed)}</div></div>
          </div>
        </div>
        <div className="btnrow" style={{ margin: '0 0 8px' }}>
          <button className="primary" onClick={() => nav('/scan', { state: { target: `g:${g.id}` } })}>Split a bill</button>
          <button className="secondary" onClick={() => sheet.open('Record payment', (close) => <PaySheet gid={g.id} close={close} />)}>Record payment</button>
        </div>
        <Seg className="s4" value={tab} onChange={(v) => setSp({ tab: v }, { replace: true })} options={TABS.map((v) => ({ value: v, label: label[v] }))} label="Group sections" />
      </div>
      <div className="vbody">
        {tab === 'bills' && <BillsTab gid={g.id} />}
        {tab === 'overview' && <OverviewTab gid={g.id} />}
        {tab === 'balances' && <BalancesTab gid={g.id} />}
        {tab === 'lists' && <ListsTab gid={g.id} />}
      </div>
    </Screen>
  )
}

export function BillsTab({ gid, personal }: { gid: string; personal?: boolean }) {
  const s = useAppState()
  const g = ledgerById(s, gid)!
  const fmt = useMoney(g)
  const [month, setMonth] = useUiState<string | null>(`grp.${gid}.month`, null)
  const [all, setAll] = useUiState<boolean>(`grp.${gid}.all`, false)
  const cur = month ?? nowKey()
  const ms = monthsAsc(g)
  const [picked, setKind] = useUiState<ActivityKind>(`grp.${gid}.filter`, 'all')
  // a personal ledger has no payments, so there is nothing to filter
  const kind = personal ? 'all' : picked
  const items = filterActivity(ledgerActivity(g), kind)
  const one = (x: ReturnType<typeof ledgerActivity>[number], i: number) =>
    x.k === 'p' ? <PayCard key={x.o.id} payment={x.o} index={i} /> : <BillCard key={x.o.id} bill={x.o} index={i} />
  const filter = personal ? null : <ActivityFilter value={kind} onChange={setKind} />
  const none = kind === 'bills' ? 'No bills here' : kind === 'payments' ? 'No settle-ups here' : ''

  if (all) {
    const keys = [...new Set(items.map((x) => x.d.slice(0, 7)))]
    return (
      <>
        <div className="row mbar"><div className="grow mute">All months</div>{filter}<button className="fchip plain" style={{ margin: 0 }} onClick={() => setAll(false)}>Month-wise</button></div>
        {keys.length ? keys.map((k) => (
          <div key={k}>
            <div className="msep">{mLabel(k)} · {fmt(monthStats(g, k).tot)}</div>
            {items.filter((x) => x.d.slice(0, 7) === k).map(one)}
          </div>
        )) : <Empty title={none || 'No bills yet'}>{none ? 'Change the filter to see everything.' : 'Snap a receipt to split your first one.'}</Empty>}
      </>
    )
  }
  const st = monthStats(g, cur)
  const inMonth = items.filter((x) => x.d.slice(0, 7) === cur)
  return (
    <>
      <MonthBar label={mLabel(cur)} sub={`${fmt(st.tot)} · ${st.n} bill${st.n === 1 ? '' : 's'}`} canPrev={cur > ms[0]} canNext={cur < nowKey()} onPrev={() => setMonth(mAdd(cur, -1))} onNext={() => setMonth(mAdd(cur, 1))}
        right={<>{filter}<button className="fchip plain" style={{ margin: '0 0 0 4px' }} onClick={() => setAll(true)}>All months</button></>} />
      {inMonth.length ? inMonth.map(one) : <Empty title={none || `No bills in ${mLabel(cur)}`}>{none ? 'Change the filter to see everything.' : 'Use the arrows or All months to look elsewhere.'}</Empty>}
    </>
  )
}

export function OverviewTab({ gid, personal }: { gid: string; personal?: boolean }) {
  const s = useAppState()
  const g = ledgerById(s, gid)!
  const fmt = useMoney(g)
  const [picked, setView] = useUiState<0 | 1 | 2>(`grp.${gid}.ov`, personal ? 1 : 0)
  // just you, so a chart of who paid and who had what has nothing to show
  const view = personal && picked === 0 ? 1 : picked
  const [monthSel, setMonthSel] = useUiState<string | null>(`grp.${gid}.ovm`, null)
  const [pick, setPick] = useState<{ kind: string; k: string } | null>(null)
  const [trend, setTrend] = useState<TrendState>({ all: true, people: !personal, off: [], st: null })
  const ms = monthsAsc(g)
  const key = monthSel && ms.includes(monthSel) ? monthSel : ms[ms.length - 1]
  const i = ms.indexOf(key)
  const st = monthStats(g, key)
  const prev = monthStats(g, mAdd(key, -1))
  const down = useRef<{ x: number; y: number } | null>(null)
  const swallow = useRef(false)
  const go = (d: number) => {
    if (i + d < 0 || i + d >= ms.length) return
    setMonthSel(ms[i + d])
    setTrend((t) => ({ ...t, st: null }))
  }
  const pickFn = (kind: string) => (k: string) => setPick(pick && pick.k === k && pick.kind === kind ? null : { kind, k })

  const onDown = (e: PointerEvent) => (down.current = { x: e.clientX, y: e.clientY })
  const onUp = (e: PointerEvent) => {
    const d = down.current
    down.current = null
    if (!d) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      go(dx < 0 ? 1 : -1)
      swallow.current = true
      setTimeout(() => (swallow.current = false), 150)
    }
  }
  return (
    <>
      <Seg className="" value={String(view) as '0' | '1' | '2'} onChange={(v) => setView(Number(v) as 0 | 1 | 2)} label="Chart type"
        options={[...(personal ? [] : [{ value: '0' as const, label: 'People' }]), { value: '1' as const, label: 'Categories' }, { value: '2' as const, label: 'Trend' }]} />
      <MonthBar label={mLabel(key)} sub={`${fmt(st.tot)} · ${st.n} bill${st.n === 1 ? '' : 's'}`} canPrev={i > 0} canNext={i < ms.length - 1} onPrev={() => go(-1)} onNext={() => go(1)} />
      <div onPointerDown={onDown} onPointerUp={onUp} onPointerCancel={() => (down.current = null)} onClickCapture={(e) => { if (swallow.current) { e.stopPropagation(); e.preventDefault() } }} aria-live="polite">
        {view === 0 && <PeopleChart ledger={g} st={st} pick={pick?.kind === 'p' ? pick.k : null} onPick={pickFn('p')} />}
        {view === 1 && <CategoryChart ledger={g} st={st} prev={prev} monthKey={key} pick={pick?.kind === 'c' ? pick.k : null} onPick={pickFn('c')} />}
        {view === 2 && <TrendChart ledger={g} monthKey={key} state={trend} onChange={setTrend} solo={personal} />}
      </div>
      <p className="mute" style={{ textAlign: 'center', fontSize: 12, margin: '8px 0 0' }}>Swipe the chart or use the arrows to change month.</p>
    </>
  )
}

function BalancesTab({ gid }: { gid: string }) {
  const s = useAppState()
  const sheet = useSheet()
  const g = ledgerById(s, gid)!
  const fmt = useMoney(g)
  const n = nets(g)
  const tr = transfers(g)
  return (
    <>
      <h2 style={{ marginTop: 4 }}>Stations</h2>
      <div className="line" style={{ ['--lc' as string]: g.color }}>
        {g.members.map((m) => {
          const v = n[m] ?? 0
          const body = (
            <>
              <Avatar pid={m} size={30} />
              <div className="grow"><b>{personName(s, m)}</b></div>
              <span className={`stat ${v < 0 ? 'r' : v > 0 ? 'g' : ''}`}>{v < 0 ? `owes ${fmt(-v)}` : v > 0 ? `is owed ${fmt(v)}` : 'settled'}</span>
              {m !== ME && <span className="mute">›</span>}
            </>
          )
          return m === ME ? (
            <div className="stn" key={m}>{body}</div>
          ) : (
            <div className="stn tap" key={m} role="button" tabIndex={0} aria-label={`Remind or message ${personName(s, m)}`}
              onClick={() => sheet.open(pairInGroup(g, m) > 0 ? 'Send a reminder' : pairInGroup(g, m) < 0 ? 'Send a heads-up' : 'Settled up', (close) => <RemindSheet pid={m} gid={g.id} close={close} />)}
              onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLElement).click()}>
              {body}
            </div>
          )
        })}
      </div>
      <h2>{g.simplify ? 'Simplified payments' : 'Direct balances'}</h2>
      {tr.length ? tr.map((x) => (
        <div className="card row rise" key={`${x.from}-${x.to}`}>
          <Avatar pid={x.from} size={32} />
          <div className="grow"><b>{personName(s, x.from)}</b> {x.from === ME ? 'owe' : 'owes'} <b>{personName(s, x.to)}</b></div>
          <b>{fmt(x.amt)}</b>
        </div>
      )) : <Empty title="All settled up">Nobody owes anything in this group.</Empty>}
      <p className="mute">{g.simplify ? 'Fewest payments to settle everyone. Change this in group settings.' : 'Shows who owes whom directly, bill by bill. Change this in group settings.'}</p>
    </>
  )
}

function ListsTab({ gid }: { gid: string }) {
  const sheet = useSheet()
  const [q, setQ] = useState('')
  return (
    <>
      <div className="row" style={{ marginBottom: 10 }}>
        <input placeholder="Search lists, or name a new one" maxLength={40} aria-label="Search lists" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="primary" style={{ width: 'auto', padding: '12px 18px', whiteSpace: 'nowrap' }} onClick={() => sheet.open('New list', (close) => <NoteSheet ctx="g" gid={gid} title={q.trim()} close={close} />)}>+ Create</button>
      </div>
      <NoteCards ctx="g" gid={gid} q={q} />
    </>
  )
}

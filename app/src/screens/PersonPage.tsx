import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { Screen } from '../app/Screen'
import { useAppState } from '../data/store'
import { filterActivity, ledgerName, letterOf, pairBalance, personActivity, type ActivityKind } from '../domain/selectors'
import { ME } from '../domain/types'
import { fmt } from '../domain/util'
import { RemindSheet } from '../sheets/RemindSheet'
import { PaySheet } from '../sheets/PaySheet'
import { Avatar, BellIcon, Bullet, Empty } from '../ui/bits'
import { ActivityFilter } from '../ui/ActivityFilter'
import { BillCard, PayCard } from '../ui/BillCards'
import { useUiState } from '../ui/uiState'
import { useSheet } from '../ui/Sheet'

export function PersonPage() {
  const { pid = '' } = useParams()
  const s = useAppState()
  const nav = useNavigate()
  const sheet = useSheet()
  const [kind, setKind] = useUiState<ActivityKind>(`person.${pid}.filter`, 'all')
  const p = s.people[pid]
  if (!p || pid === ME) return <Navigate to="/groups" replace />
  const pr = pairBalance(s, pid)
  const t = pr.tot

  // 1-1 bills plus every payment between the two of you, with the pieces of one payment shown as one
  const all = personActivity(s, pid)
  const activity = filterActivity(all, kind)

  return (
    <Screen id="v-person">
      <div className="vhead">
        <div className="row" style={{ margin: '2px 0 10px' }}>
          <Avatar pid={pid} size={56} />
          <div className="grow">
            <div className="gname" style={{ fontSize: 28, lineHeight: 1.05 }}>{p.name}</div>
            <div className="mute">{p.user ? `@${p.tag ?? ''}` : 'Not on the app · tracked locally'}</div>
          </div>
        </div>
        <div className="sign" style={{ marginBottom: 8 }}>
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <div className="grow">
              <div className="lbl">{t > 0 ? `${p.name} owes you` : t < 0 ? `You owe ${p.name}` : 'Settled up'}</div>
              <div className={`num ${t > 0 ? 'g' : t < 0 ? 'r' : ''}`} style={{ fontSize: 32 }}>{fmt(Math.abs(t))}</div>
            </div>
            {t !== 0 && (
              <button className="secondary pillb remindbtn" aria-label={`${t > 0 ? 'Send a reminder to' : 'Send a heads-up to'} ${p.name}`}
                onClick={() => sheet.open(t > 0 ? 'Send a reminder' : 'Send a heads-up', (close) => <RemindSheet pid={pid} gid={null} close={close} />)}>
                <BellIcon />{t > 0 ? 'Remind' : 'Heads-up'}
              </button>
            )}
          </div>
        </div>
        <div className="btnrow" style={{ margin: '0 0 6px' }}>
          <button className="primary" onClick={() => nav('/scan', { state: { target: `p:${pid}` } })}>Split 1-1</button>
          <button className="secondary" onClick={() => sheet.open('Record payment', (close) => <PaySheet pid={pid} close={close} />)}>Record payment</button>
        </div>
      </div>
      <div className="vbody">
        <h2 style={{ marginTop: 6 }}>Where it adds up</h2>
        {pr.parts.length ? pr.parts.map((x) => {
          const l = x.ledger as unknown as (typeof s.ledgers)[number]
          const inner = (
            <>
              {l.kind === 'group' ? <Bullet letter={letterOf(l.name ?? '?')} color={l.color ?? '#A7A9AC'} size={36} /> : <Avatar pid={pid} size={36} />}
              <div className="grow"><b>{ledgerName(s, l)}</b></div>
              <span className={`stat ${x.amt > 0 ? 'g' : 'r'}`}>{x.amt > 0 ? 'owes you ' : 'you owe '}{fmt(Math.abs(x.amt))}</span>
            </>
          )
          return l.kind === 'group' ? <Link className="card row tap rise" to={`/groups/${l.id}`} key={l.id}>{inner}</Link> : <div className="card row rise" key={l.id}>{inner}</div>
        }) : <Empty small title="Nothing outstanding">You two are even.</Empty>}
        <div className="row" style={{ margin: '14px 0 8px' }}>
          <h2 style={{ margin: 0, flex: 1 }}>Activity</h2>
          <ActivityFilter value={kind} onChange={setKind} />
        </div>
        {activity.length ? (
          activity.map((x, i) => (x.k === 'p' ? <PayCard key={x.o.id} payment={x.o} index={i} /> : <BillCard key={x.o.id} bill={x.o} index={i} />))
        ) : (
          <Empty small title={all.length ? (kind === 'bills' ? 'No bills' : 'No settle-ups') : 'No activity'}>{all.length ? 'Change the filter to see everything.' : undefined}</Empty>
        )}
      </div>
    </Screen>
  )
}


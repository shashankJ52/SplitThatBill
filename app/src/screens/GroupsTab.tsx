import { useRef, type PointerEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Screen } from '../app/Screen'
import { useAppState } from '../data/store'
import { filteredGroups, filteredPeople, letterOf, overallTotals, personName, type BalanceFilter } from '../domain/selectors'
import { ME } from '../domain/types'
import { myNet } from '../money'
import { fmt } from '../domain/util'
import { GroupSheet } from '../sheets/GroupSheet'
import { PickSheet } from '../sheets/PickSheet'
import { Avatar, Bullet, Empty } from '../ui/bits'
import { useSheet } from '../ui/Sheet'
import { useUiState } from '../ui/uiState'
import { pairBalance } from '../domain/selectors'

const CAPTION: Record<BalanceFilter, string> = {
  net: '',
  owe: 'Only what you owe. Tap Net for everything.',
  owed: "Only what you're owed. Tap Net for everything.",
}

export function GroupsTab() {
  const s = useAppState()
  const nav = useNavigate()
  const sheet = useSheet()
  const [filter, setFilter] = useUiState<BalanceFilter>('groups.filter', 'net')
  const [exp, setExp] = useUiState<'lines' | 'people' | null>('groups.exp', null)
  const drag = useRef<{ k: 'lines' | 'people'; y: number; x: number } | null>(null)
  const swallow = useRef(false)

  const t = overallTotals(s)
  const groups = filteredGroups(s, filter)
  const people = filteredPeople(s, filter)
  const allGroups = s.ledgers.filter((l) => l.kind === 'group').length

  const pickTile = (f: BalanceFilter) => setFilter(filter === f && f !== 'net' ? 'net' : f)

  const onDown = (k: 'lines' | 'people') => (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    drag.current = { k, y: e.clientY, x: e.clientX }
  }
  const onUp = (e: PointerEvent) => {
    const d = drag.current
    drag.current = null
    if (!d) return
    const dy = e.clientY - d.y
    const dx = e.clientX - d.x
    if (Math.abs(dy) > 28 && Math.abs(dy) > Math.abs(dx) * 1.3) {
      setExp(dy > 0 ? d.k : null)
      swallow.current = true
      setTimeout(() => (swallow.current = false), 150)
    }
  }
  const head = (k: 'lines' | 'people', title: string, btn: string, aria: string, onBtn: () => void) => (
    <div
      className="shead" role="button" tabIndex={0} aria-expanded={exp === k}
      onPointerDown={onDown(k)} onPointerUp={onUp} onPointerCancel={() => (drag.current = null)}
      onClick={(e) => { if (swallow.current || (e.target as HTMLElement).closest('button')) return; setExp(exp === k ? null : k) }}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setExp(exp === k ? null : k)}
    >
      <h2>{title}</h2>
      <button className="secondary pillb" aria-label={aria} onClick={onBtn}>{btn}</button>
      <span className="chev" aria-hidden="true">⌄</span>
    </div>
  )

  return (
    <Screen id="v-groups">
      <div className="vhead">
        <h1 className="display">Groups</h1>
        <div className="sign">
          <div className="cols">
            <Tile active={filter === 'owe'} onClick={() => pickTile('owe')} label="You owe" cls="r" value={fmt(t.owe)} icon={<Bullet letter="−" color="#EE352E" size={16} />} />
            <Tile active={filter === 'owed'} onClick={() => pickTile('owed')} label="Owed" cls="g" value={fmt(t.owed)} icon={<Bullet letter="+" color="#00933C" size={16} />} />
            <Tile active={filter === 'net'} onClick={() => pickTile('net')} label="Net" cls="" value={fmt(t.owed - t.owe)} />
          </div>
          {filter !== 'net' && <div className="mute" style={{ marginTop: 8, fontSize: 12 }}>{CAPTION[filter]}</div>}
        </div>
      </div>
      <div className="vbody split">
        <section className={`sect${exp === 'people' ? ' col' : ''}`} id="sect-lines">
          {head('lines', 'Your lines', '+ New', 'New group', () => sheet.open('New group', (close) => <GroupSheet close={close} onCreated={(id) => nav(`/groups/${id}`)} />))}
          <div className="sscroll">
            {groups.length ? (
              groups.map((g, i) => {
                const n = myNet(g, ME)
                return (
                  <Link key={g.id} className="card tap row rise" style={{ ['--i' as string]: i }} to={`/groups/${g.id}`}>
                    <Bullet letter={letterOf(g.name ?? '?')} color={g.color ?? '#A7A9AC'} size={46} />
                    <div className="grow">
                      <div className="gname">{g.name}</div>
                      <div className="mute">{g.members.length} {g.members.length === 1 ? 'person' : 'people'}</div>
                    </div>
                    {n < 0 ? <span className="stat r">owe {fmt(-n)}</span> : n > 0 ? <span className="stat g">owed {fmt(n)}</span> : <span className="stat mute">settled up</span>}
                  </Link>
                )
              })
            ) : (
              <Empty title={allGroups ? (filter === 'owe' ? 'You owe nothing in groups' : 'Nobody owes you in groups') : 'No groups yet'}>
                {allGroups ? 'Tap Net to see all your groups.' : 'Tap + New to make one for your apartment, trip or friend crew.'}
              </Empty>
            )}
          </div>
        </section>
        <section className={`sect${exp === 'lines' ? ' col' : ''}`} id="sect-people">
          {head('people', 'People', 'Find', 'Find or add someone', () => sheet.open('Find someone', (close) => <PickSheet mode="f" close={close} onPick={(v) => nav(`/person/${v.slice(2)}`)} />))}
          <div className="sscroll">
            {people.length ? (
              people.map((x, i) => {
                const parts = pairBalance(s, x.p).parts.length
                return (
                  <Link key={x.p} className="card tap row rise" style={{ ['--i' as string]: i }} to={`/person/${x.p}`}>
                    <Avatar pid={x.p} size={46} />
                    <div className="grow">
                      <div className="gname">{personName(s, x.p)}</div>
                      <div className="mute">1-1{parts > 1 ? ` + ${parts - 1} group${parts > 2 ? 's' : ''}` : ''}</div>
                    </div>
                    <span className={`stat ${x.t > 0 ? 'g' : 'r'}`}>{x.t > 0 ? `owes you ${fmt(x.t)}` : `you owe ${fmt(-x.t)}`}</span>
                  </Link>
                )
              })
            ) : (
              <Empty small title={filter === 'owe' ? 'You owe no one 1-1' : filter === 'owed' ? 'No one owes you 1-1' : 'No 1-1 balances'}>
                {filter === 'net' ? 'People you split with one-on-one show up here while money is outstanding.' : 'Tap Net to see everyone.'}
              </Empty>
            )}
          </div>
        </section>
      </div>
    </Screen>
  )
}

function Tile({ active, onClick, label, cls, value, icon }: { active: boolean; onClick: () => void; label: string; cls: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className={`tile${active ? ' on' : ''}`} role="button" tabIndex={0} aria-pressed={active} onClick={onClick} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onClick()}>
      <div className="lbl">{icon}{label}</div>
      <div className={`num ${cls}`}>{value}</div>
    </div>
  )
}

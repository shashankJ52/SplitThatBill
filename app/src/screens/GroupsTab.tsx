import { useRef, type PointerEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Screen } from '../app/Screen'
import * as A from '../data/actions'
import { useAppState, useStore } from '../data/store'
import { activeCurrencies, monthStats, personalLedger, arrangedGroups, arrangedPeople, currencyOf, defaultCurrency, groupGlyph, orderBy, otherTotals, overallTotals, personName, realGroups, shownPeople, type BalanceFilter } from '../domain/selectors'
import { CurrencyChip } from '../ui/CurrencyChip'
import { ME } from '../domain/types'
import { myNet } from '../money'
import { fmt as fmtIn, nowKey, today } from '../domain/util'
import { useWide } from '../ui/useWide'
import { shareMyTag } from '../ui/shareTag'
import { GroupSheet } from '../sheets/GroupSheet'
import { PaySheet } from '../sheets/PaySheet'
import { PickSheet } from '../sheets/PickSheet'
import { Avatar, Bullet, Empty } from '../ui/bits'
import { ReorderList } from '../ui/ReorderList'
import { reorderSubset } from '../ui/reorder'
import { useSheet } from '../ui/Sheet'
import { useToast } from '../ui/Toast'
import { useUiState } from '../ui/uiState'
import { pairBalance } from '../domain/selectors'
import { ChevronIcon } from '../ui/icons'

const CAPTION: Record<BalanceFilter, string> = {
  net: '',
  owe: 'Only what you owe. Tap Net for everything.',
  owed: "Only what you're owed. Tap Net for everything.",
}

export function GroupsTab() {
  const s = useAppState()
  const nav = useNavigate()
  const sheet = useSheet()
  const store = useStore()
  const toast = useToast()
  const [filter, setFilter] = useUiState<BalanceFilter>('groups.filter', 'net')
  const [exp, setExp] = useUiState<'lines' | 'people' | null>('groups.exp', null)
  const drag = useRef<{ k: 'lines' | 'people'; y: number; x: number } | null>(null)
  const swallow = useRef(false)

  // the currency being looked at: only currencies where something was recorded are offered, and only when there are several
  const [picked, setPicked] = useUiState<string | null>('groups.currency', null)
  const options = activeCurrencies(s)
  const view = picked && options.includes(picked) ? picked : defaultCurrency(s)
  const fmt = (c: number) => fmtIn(c, view)
  const t = overallTotals(s, view)
  const others = otherTotals(s, view)
  const groups = arrangedGroups(s, filter, view)
  const people = arrangedPeople(s, filter, view)
  const allGroups = s.ledgers.filter((l) => l.kind === 'group').length
  const wide = useWide()
  const personal = personalLedger(s)
  const mine = personal ? monthStats(personal, nowKey()).tot : 0

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
  /** Ask what the payment is for, then who or which group, then open the same sheet as on that person's or group's page. */
  const recordPayment = () =>
    sheet.open('Record payment', (close) => (
      <>
        <button className="card tap row" style={{ width: '100%', textAlign: 'left' }} onClick={() => { close(); pickPerson() }}>
          <div className="grow">
            <b>With a person</b>
            <div className="mute">Applied to your 1-1 splits first, then shared groups</div>
          </div>
        </button>
        <button className="card tap row" style={{ width: '100%', textAlign: 'left' }} onClick={() => { close(); pickGroup() }}>
          <div className="grow">
            <b>In a group</b>
            <div className="mute">Who paid whom inside one group</div>
          </div>
        </button>
      </>
    ))
  const pickPerson = () =>
    sheet.open('Who was the payment with?', (close) => (
      <PickSheet mode="p" close={close} onPick={(v) => sheet.open('Record payment', (done) => <PaySheet pid={v.slice(2)} close={done} />)} />
    ))
  const pickGroup = () =>
    sheet.open('Which group?', (close) => (
      <PickSheet mode="g" close={close} onPick={(v) => sheet.open('Record payment', (done) => <PaySheet gid={v.slice(2)} close={done} />)} />
    ))

  const head = (k: 'lines' | 'people', title: string, btn: string, aria: string, onBtn: () => void) => (
    <div
      className="shead" role="button" tabIndex={0} aria-expanded={exp === k}
      onPointerDown={onDown(k)} onPointerUp={onUp} onPointerCancel={() => (drag.current = null)}
      onClick={(e) => { if (swallow.current || (e.target as HTMLElement).closest('button')) return; setExp(exp === k ? null : k) }}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setExp(exp === k ? null : k)}
    >
      <h2>{title}</h2>
      <button className="secondary pillb" aria-label={aria} onClick={onBtn}>{btn}</button>
      <span className="chev" aria-hidden="true"><ChevronIcon /></span>
    </div>
  )

  return (
    <Screen id="v-groups">
      <div className="vhead">
        <div className="titlerow">
          <h1 className="display">Groups</h1>
          {options.length > 1 && <CurrencyChip value={view} options={options} onPick={setPicked} label="Show amounts in" />}
        </div>
        <div className="sign">
          <div className="cols">
            <Tile active={filter === 'owe'} onClick={() => pickTile('owe')} label="You owe" cls="r" value={fmt(t.owe)} icon={<Bullet letter="−" color="#EE352E" size={16} />} />
            <Tile active={filter === 'owed'} onClick={() => pickTile('owed')} label="Owed" cls="g" value={fmt(t.owed)} icon={<Bullet letter="+" color="#00933C" size={16} />} />
            <Tile active={filter === 'net'} onClick={() => pickTile('net')} label="Net" cls="" center value={fmt(t.owed - t.owe)} />
          </div>
          {filter !== 'net' && <div className="mute" style={{ marginTop: 8, fontSize: 12 }}>{CAPTION[filter]}</div>}
          {others.length > 0 && (
            <div className="mute" style={{ marginTop: 8, fontSize: 12 }}>
              Totals are in {view}. Other currencies: {others.map((o) => `${fmtIn(o.owed - o.owe, o.code)} net`).join(' · ')}
            </div>
          )}
        </div>
        <button className="secondary" style={{ marginTop: 10 }} onClick={recordPayment}>Record payment</button>
        {allGroups === 0 && Object.keys(s.people).every((p) => p === ME) && (
          <div className="card" style={{ display: 'block', marginTop: 10 }}>
            <b>{s.profile.name.split(' ')[0] ? `Welcome, ${s.profile.name.split(' ')[0]}!` : 'Welcome!'} Start here</b>
            <div className="mute" style={{ margin: '2px 0 8px' }}>Three steps to your first split.</div>
            <div className="row" style={{ padding: '6px 0' }}>
              <Bullet letter="1" color="#0039A6" size={30} />
              <div className="grow"><b>Find a friend</b><div className="mute">Search by their @usertag</div></div>
              <button className="secondary pillb" onClick={() => sheet.open('Find someone', (close) => <PickSheet mode="f" close={close} onPick={(v) => nav(`/person/${v.slice(2)}`)} />)}>Find</button>
            </div>
            <div className="row" style={{ padding: '6px 0' }}>
              <Bullet letter="2" color="#FF6319" size={30} />
              <div className="grow"><b>Make a group</b><div className="mute">For your flat, a trip or a friend crew</div></div>
              <button className="secondary pillb" onClick={() => sheet.open('New group', (close) => <GroupSheet close={close} onCreated={(id) => nav(`/groups/${id}`)} />)}>+ New</button>
            </div>
            <div className="row" style={{ padding: '6px 0' }}>
              <Bullet letter="3" color="#00933C" size={30} />
              <div className="grow"><b>Scan a receipt</b><div className="mute">Or type the items in yourself</div></div>
              <button className="secondary pillb" onClick={() => nav('/scan')}>Scan</button>
            </div>
            <button className="linkbtn" style={{ marginTop: 6 }} onClick={() => void shareMyTag(s.profile.tag, toast)}>Invite a friend: share my tag @{s.profile.tag}</button>
          </div>
        )}
        {!wide && (
          <Link className="card row tap" style={{ marginTop: 10 }} to="/personal">
            <Bullet letter="👤" color={A.PERSONAL_COLOR} size={34} />
            <div className="grow"><b>Personal</b><div className="mute">Spending that is just yours</div></div>
            <div style={{ textAlign: 'right' }}><b>{fmtIn(mine, defaultCurrency(s))}</b><div className="mute">this month</div></div>
          </Link>
        )}
      </div>
      <div className="vbody split">
        <section className={`sect${exp === 'people' ? ' col' : ''}`} id="sect-lines">
          {head('lines', 'Your lines', '+ New', 'New group', () => sheet.open('New group', (close) => <GroupSheet close={close} onCreated={(id) => nav(`/groups/${id}`)} />))}
          <div className="sscroll">
            {groups.length ? (
              <ReorderList
                onReorder={(keys) => store.update((st) => A.setGroupOrder(st, reorderSubset(orderBy(realGroups(st), (g) => g.id, st.layout?.groups).map((g) => g.id), keys)))}
                items={groups.map((g) => {
                  const n = myNet(g, ME)
                  return {
                    key: g.id,
                    node: (
                      <Link className="card tap row ncf" to={`/groups/${g.id}`}>
                        <Bullet letter={groupGlyph(g)} color={g.color ?? '#A7A9AC'} size={46} />
                        <div className="grow">
                          <div className="gname">{g.name}</div>
                          <div className="mute">{shownPeople(g).length} {shownPeople(g).length === 1 ? 'person' : 'people'}</div>
                        </div>
                        {n < 0 ? <span className="stat r">owe {fmtIn(-n, currencyOf(s, g))}</span> : n > 0 ? <span className="stat g">owed {fmtIn(n, currencyOf(s, g))}</span> : <span className="stat mute">settled up</span>}
                      </Link>
                    ),
                  }
                })}
              />
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
              <ReorderList
                dismissLabel="Remove"
                onReorder={(keys) => store.update((st) => A.setPeopleOrder(st, reorderSubset(arrangedPeople(st, 'net', view).map((x) => x.p), keys)))}
                onDismiss={(pid) => {
                  store.update((st) => A.dismissPerson(st, pid, today()))
                  toast(`${personName(s, pid)} removed from People. They come back when something new happens.`, () => store.update((st) => A.undismissPerson(st, pid)))
                }}
                items={people.map((x) => {
                  const parts = pairBalance(s, x.p, view).parts.length
                  // the balance shown is in your own currency; with none there, the first other currency stands in for it
                  const bal = x.t !== 0 ? { tot: x.t, code: view } : (x.others?.[0] ?? null)
                  const extra = x.t !== 0 ? (x.others ?? []) : (x.others ?? []).slice(1)
                  return {
                    key: x.p,
                    swipe: x.settled,
                    node: (
                      <Link className="card tap row ncf" to={`/person/${x.p}`}>
                        <Avatar pid={x.p} size={46} />
                        <div className="grow">
                          <div className="gname">{personName(s, x.p)}</div>
                          <div className="mute">1-1{parts > 1 ? ` + ${parts - 1} group${parts > 2 ? 's' : ''}` : ''}</div>
                          {extra.length > 0 && <div className="mute" style={{ fontSize: 12 }}>{extra.map((o) => `${o.tot > 0 ? 'also owes you' : 'you also owe'} ${fmtIn(Math.abs(o.tot), o.code)}`).join(' · ')}</div>}
                        </div>
                        {x.settled || !bal ? <span className="stat mute">settled up</span> : <span className={`stat ${bal.tot > 0 ? 'g' : 'r'}`}>{bal.tot > 0 ? `owes you ${fmtIn(bal.tot, bal.code)}` : `you owe ${fmtIn(-bal.tot, bal.code)}`}</span>}
                      </Link>
                    ),
                  }
                })}
              />
            ) : (
              <Empty small title={filter === 'owe' ? 'You owe no one 1-1' : filter === 'owed' ? 'No one owes you 1-1' : 'No 1-1 balances'}>
                {filter === 'net' ? "People you split with one-on-one show up here. Settled-up ones stay for a while; swipe them away when you are done." : 'Tap Net to see everyone.'}
              </Empty>
            )}
          </div>
        </section>
      </div>
    </Screen>
  )
}

function Tile({ active, onClick, label, cls, value, icon, center }: { active: boolean; onClick: () => void; label: string; cls: string; value: string; icon?: React.ReactNode; center?: boolean }) {
  return (
    <div className={`tile${active ? ' on' : ''}${center ? ' center' : ''}`} role="button" tabIndex={0} aria-pressed={active} onClick={onClick} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onClick()}>
      <div className="lbl">{icon}{label}</div>
      {/* long amounts shrink so they stay on one line inside the tile */}
      <div className={`num ${cls}`} style={{ fontSize: value.length <= 8 ? undefined : value.length <= 10 ? 20 : value.length <= 12 ? 17 : 12 }}>{value}</div>
    </div>
  )
}

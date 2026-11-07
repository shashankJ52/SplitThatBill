import { useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import * as A from '../data/actions'
import { useAppState, useStore } from '../data/store'
import { currencyOf, defaultCurrency, groupGlyph, monthStats, orderBy, otherPairBalances, pairBalance, personalLedger, personName, realGroups, sideCandidates, sideHiddenCount, sidePeople } from '../domain/selectors'
import { ME } from '../domain/types'
import { fmt, nowKey } from '../domain/util'
import { myNet } from '../money'
import { PaySheet } from '../sheets/PaySheet'
import { Avatar, Bullet } from './bits'
import { ReorderList } from './ReorderList'
import { reorderSubset } from './reorder'
import { useSheet } from './Sheet'
import { ChevronIcon, CloseIcon } from './icons'

/** Whether a section of the sidebar is shown. Kept on this device, so it is the same next time. */
function useShown(key: string): [boolean, (v: boolean) => void] {
  const [shown, setShown] = useState(() => {
    try {
      return localStorage.getItem(key) !== 'off'
    } catch {
      return true
    }
  })
  const set = (v: boolean) => {
    setShown(v)
    try {
      localStorage.setItem(key, v ? 'on' : 'off')
    } catch {
      /* the choice just does not stick */
    }
  }
  return [shown, set]
}

function Section({ id, title, children }: { id: string; title: string; children: (shown: boolean) => ReactNode }) {
  const [shown, setShown] = useShown(id)
  return (
    <div className="sidelines">
      <button type="button" className="sl-head" aria-expanded={shown} onClick={() => setShown(!shown)}>
        <span>{title}</span>
        <span className="chev" aria-hidden="true"><ChevronIcon /></span>
      </button>
      {shown && children(shown)}
    </div>
  )
}

/**
 * The laptop and iPad sidebar's shortcuts: your groups ("lines") and your few most recent 1-1 splits. Click one to open
 * it, tap its $ to record a payment right away, and press and hold a row, then drag, to order them. A 1-1 can be hidden
 * from here with its x (it stays in the Groups tab). Each list can be collapsed.
 */
export function SideLines() {
  return (
    <>
      <Lines />
      <Personal />
      <People />
    </>
  )
}

function Lines() {
  const s = useAppState()
  const store = useStore()
  const sheet = useSheet()
  const loc = useLocation()
  const groups = orderBy(realGroups(s), (g) => g.id, s.layout?.groups)
  if (!groups.length) return null
  return (
    <Section id="stb-side-lines" title="Your lines">
      {() => (
        <>
          <div className="sl-list">
            <ReorderList
              onReorder={(keys) => store.update((st) => A.setGroupOrder(st, reorderSubset(orderBy(realGroups(st), (g) => g.id, st.layout?.groups).map((g) => g.id), keys)))}
              items={groups.map((g) => {
                const n = myNet(g, ME)
                const here = loc.pathname === `/groups/${g.id}`
                return {
                  key: g.id,
                  node: (
                    <div className={`side-line ncf${here ? ' on' : ''}`}>
                      <Link to={`/groups/${g.id}`} className="sl-main" aria-current={here ? 'page' : undefined}>
                        <Bullet letter={groupGlyph(g)} color={g.color ?? '#A7A9AC'} size={28} />
                        <span className="sl-text">
                          <b>{g.name}</b>
                          <small className={n < 0 ? 'r' : n > 0 ? 'g' : ''}>{n < 0 ? `you owe ${fmt(-n, currencyOf(s, g))}` : n > 0 ? `owed ${fmt(n, currencyOf(s, g))}` : 'settled up'}</small>
                        </span>
                      </Link>
                      <button type="button" className="sl-pay" aria-label={`Record a payment in ${g.name}`} title="Record a payment" onClick={() => sheet.open('Record payment', (close) => <PaySheet gid={g.id} close={close} />)}>$</button>
                    </div>
                  ),
                }
              })}
            />
          </div>
          <div className="sl-hint">Hold a line, then drag, to reorder. $ records a payment.</div>
        </>
      )}
    </Section>
  )
}

/** Your own spending, kept apart from anything shared. One row that opens the Personal page. */
function Personal() {
  const s = useAppState()
  const loc = useLocation()
  const l = personalLedger(s)
  const spent = l ? monthStats(l, nowKey()).tot : 0
  const here = loc.pathname === '/personal'
  return (
    <Section id="stb-side-personal" title="Personal">
      {() => (
        <div className="sl-list">
          <div className={`side-line ncf${here ? ' on' : ''}`}>
            <Link to="/personal" className="sl-main" aria-current={here ? 'page' : undefined}>
              <Bullet letter="👤" color={A.PERSONAL_COLOR} size={28} />
              <span className="sl-text">
                <b>Personal</b>
                <small>{`spent ${fmt(spent, currencyOf(s, l))} this month`}</small>
              </span>
            </Link>
          </div>
        </div>
      )}
    </Section>
  )
}

function People() {
  const s = useAppState()
  const store = useStore()
  const sheet = useSheet()
  const loc = useLocation()
  const people = sidePeople(s)
  const hidden = sideHiddenCount(s)
  if (!people.length && !hidden) return null
  return (
    <Section id="stb-side-people" title="Recent 1-1s">
      {() => (
        <>
          <div className="sl-list">
            <ReorderList
              onReorder={(keys) => store.update((st) => A.setPeopleOrder(st, reorderSubset(sideCandidates(st), keys)))}
              items={people.map((p) => {
                const own = defaultCurrency(s)
                const t = pairBalance(s, p).tot
                const other = otherPairBalances(s, p)[0]
                const bal = t !== 0 ? { tot: t, code: own } : other ? { tot: other.tot, code: other.code } : null
                const here = loc.pathname === `/person/${p}`
                const name = personName(s, p)
                return {
                  key: p,
                  node: (
                    <div className={`side-line ncf${here ? ' on' : ''}`}>
                      <Link to={`/person/${p}`} className="sl-main" aria-current={here ? 'page' : undefined}>
                        <Avatar pid={p} size={28} />
                        <span className="sl-text">
                          <b>{name}</b>
                          <small className={bal ? (bal.tot > 0 ? 'g' : 'r') : ''}>{bal ? (bal.tot > 0 ? `owes you ${fmt(bal.tot, bal.code)}` : `you owe ${fmt(-bal.tot, bal.code)}`) : 'settled up'}</small>
                        </span>
                      </Link>
                      <button type="button" className="sl-pay" aria-label={`Record a payment with ${name}`} title="Record a payment" onClick={() => sheet.open('Record payment', (close) => <PaySheet pid={p} close={close} />)}>$</button>
                      <button type="button" className="sl-x" aria-label={`Hide ${name} from the sidebar`} title="Hide from the sidebar" onClick={() => store.update((st) => A.hideSidePerson(st, p))}><CloseIcon /></button>
                    </div>
                  ),
                }
              })}
            />
          </div>
          {hidden > 0 && (
            <button type="button" className="sl-restore" onClick={() => store.update(A.showSidePeople)}>
              Show {hidden} hidden
            </button>
          )}
          {people.length > 0 && <div className="sl-hint">Hold a name, then drag, to reorder. The x button hides it here only.</div>}
        </>
      )}
    </Section>
  )
}

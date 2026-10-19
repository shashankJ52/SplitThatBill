import { useRef, type KeyboardEvent, type PointerEvent as RPointerEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Screen } from '../app/Screen'
import * as A from '../data/actions'
import { useAppState, useStore } from '../data/store'
import { findBill, ledgerById, letterOf, pairInGroup, personName, realGroups, unreadCount, type NoteFilter } from '../domain/selectors'
import type { Notif } from '../domain/types'
import { ago, fmt } from '../domain/util'
import { NoteSheet } from '../sheets/NoteSheet'
import { PaySheet } from '../sheets/PaySheet'
import { Avatar, Bullet, Empty, Seg } from '../ui/bits'
import { NoteCards } from '../ui/NoteCards'
import { useSheet } from '../ui/Sheet'
import { useToast } from '../ui/Toast'
import { useUiState } from '../ui/uiState'

function metaOf(s: ReturnType<typeof useAppState>, n: Notif): { c: string; letter: string } {
  if (n.kind === 'remind') return { c: '#EE352E', letter: '!' }
  const f = n.billId ? findBill(s, n.billId) : null
  const g = f?.ledger ?? (n.gid ? ledgerById(s, n.gid) : undefined)
  if (/ paid /.test(n.text)) return { c: '#00933C', letter: '$' }
  if (g?.kind === 'group') return { c: g.color ?? '#A7A9AC', letter: letterOf(g.name ?? '?') }
  return { c: '#A7A9AC', letter: '•' }
}

const TIER1 = 60
const TIER2 = 160

/** One alert. A short swipe toggles read, a long one dismisses. R and Delete do the same from the keyboard. */
function NotifRow({ n, onOpen, onToggle, onDismiss }: { n: Notif; onOpen: () => void; onToggle: () => void; onDismiss: () => void }) {
  const s = useAppState()
  const m = metaOf(s, n)
  const wrap = useRef<HTMLDivElement>(null)
  const face = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; id: number; on: boolean; dx: number } | null>(null)
  const moved = useRef(false)

  const setTier = (dx: number) => {
    if (!wrap.current) return
    const a = Math.abs(dx)
    wrap.current.dataset.tier = String(a >= TIER2 ? 2 : a >= TIER1 ? 1 : 0)
    wrap.current.dataset.dir = dx < 0 ? 'l' : 'r'
  }
  const down = (e: RPointerEvent) => {
    if (e.button > 0) return
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId, on: false, dx: 0 }
  }
  const move = (e: RPointerEvent) => {
    const d = drag.current
    if (!d || !face.current) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (!d.on) {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.3) {
        d.on = true
        face.current.style.transition = 'none'
        try {
          face.current.setPointerCapture(d.id)
        } catch {
          /* pointer already gone */
        }
      } else return
    }
    d.dx = dx
    face.current.style.transform = `translateX(${dx}px)`
    setTier(dx)
  }
  const end = () => {
    const d = drag.current
    drag.current = null
    if (!d?.on || !face.current) return
    moved.current = true
    setTimeout(() => (moved.current = false), 150)
    const a = Math.abs(d.dx)
    face.current.style.transition = 'transform .25s var(--ease)'
    if (a >= TIER2) {
      face.current.style.transform = `translateX(${d.dx < 0 ? '-110%' : '110%'})`
      setTimeout(onDismiss, 220)
    } else {
      face.current.style.transform = ''
      setTier(0)
      if (a >= TIER1) onToggle()
    }
  }
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onOpen()
    } else if (e.key === 'r' || e.key === 'R') {
      e.preventDefault()
      onToggle()
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      onDismiss()
    }
  }

  return (
    <div className="nc" ref={wrap} data-tier="0">
      <div className="ncbg" aria-hidden="true">
        <span className="t1">{n.read ? 'Mark unread' : 'Mark read'}</span>
        <span className="t2">Dismiss</span>
      </div>
      <div
        ref={face}
        className={`card ncf tap row ${n.read ? 'rd' : 'unread'}`}
        style={{ '--nc': m.c } as React.CSSProperties}
        role="button"
        tabIndex={0}
        aria-label={`${n.text}. ${n.read ? 'Read' : 'Unread'}. Press R to mark ${n.read ? 'unread' : 'read'}, Delete to dismiss.`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onClick={() => !moved.current && onOpen()}
        onKeyDown={key}
      >
        <Bullet letter={m.letter} color={m.c} size={40} />
        <div className="grow">
          <b>{n.text}</b>
          <div className="mute">{n.sub} · {ago(n.ts)}</div>
        </div>
      </div>
    </div>
  )
}

function ReminderSheet({ n, close }: { n: Notif; close: () => void }) {
  const s = useAppState()
  const nav = useNavigate()
  const sheet = useSheet()
  const g = n.gid ? ledgerById(s, n.gid) : undefined
  const from = n.from ?? ''
  const a = g ? pairInGroup(g, from) : 0
  const pay = () => {
    close()
    if (!g) return
    nav(`/groups/${g.id}?tab=balances`)
    setTimeout(() => sheet.open('Record payment', (c) => <PaySheet gid={g.id} close={c} />), 350)
  }
  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <Avatar pid={from} size={44} />
        <div className="grow">
          <div className="gname">{personName(s, from)}</div>
          <div className="mute">{g?.name ?? ''} · {ago(n.ts)}</div>
        </div>
      </div>
      <div className="card" style={{ whiteSpace: 'pre-wrap' }}>{n.msg ?? ''}</div>
      {a < 0 ? <div className="bar bad">You currently owe {personName(s, from)} {fmt(-a)}.</div> : <div className="bar ok">You're all settled up here. Thanks!</div>}
      {a < 0 && (
        <>
          <button className="primary" onClick={pay}>Record payment</button>
          <div style={{ height: 10 }} />
        </>
      )}
      <button className="secondary" onClick={close}>Close</button>
    </>
  )
}

export function AlertsTab() {
  const s = useAppState()
  const store = useStore()
  const nav = useNavigate()
  const sheet = useSheet()
  const toast = useToast()
  const [tab, setTab] = useUiState<'splits' | 'notes'>('al.tab', 'splits')
  const [q, setQ] = useUiState('al.q', '')
  const [filter, setFilter] = useUiState<NoteFilter>('al.filter', 'all')
  const list = s.notifs.slice().sort((a, b) => b.ts - a.ts)
  const unread = unreadCount(s)
  const groups = realGroups(s)
  const f: NoteFilter = filter.startsWith('g:') && !ledgerById(s, filter.slice(2)) ? 'all' : filter

  const open = (n: Notif) => {
    store.update((st) => A.markRead(st, n.id))
    if (n.kind === 'remind') return sheet.open(`Reminder from ${personName(s, n.from ?? '')}`, (close) => <ReminderSheet n={n} close={close} />)
    if (n.billId && findBill(s, n.billId)) return nav(`/bill/${n.billId}`)
    if (n.gid && ledgerById(s, n.gid)?.kind === 'group') return nav(`/groups/${n.gid}`)
    if (n.pid) return nav(`/person/${n.pid}`)
    toast('That item no longer exists')
  }
  const toggle = (n: Notif) => {
    store.update((st) => A.toggleRead(st, n.id))
    toast(n.read ? 'Marked as unread' : 'Marked as read')
  }
  const dismiss = (n: Notif) => {
    const r = A.dismissNotif(store.get(), n.id)
    if (!r.removed) return
    store.update(() => r.state)
    const removed = r.removed
    toast('Dismissed', () => store.update((st) => A.restoreNotif(st, removed, r.index)))
  }
  const bulk = () => {
    if (unread) {
      store.update(A.markAllRead)
      toast('All marked as read')
    } else if (list.length) {
      const r = A.dismissAll(store.get())
      store.update(() => r.state)
      toast('Dismissed all', () => store.update((st) => A.restoreAll(st, r.removed)))
    }
  }

  return (
    <Screen id="v-alerts">
      <div className="vhead">
        <h1 className="display">Alerts</h1>
        <Seg
          className="al"
          label="Alerts view"
          value={tab}
          options={[{ value: 'splits', label: <>Splits{unread ? <span className="cnt">{unread}</span> : null}</> }, { value: 'notes', label: 'Short notes' }]}
          onChange={setTab}
        />
      </div>
      <div className="vbody split">
        {tab === 'splits' ? (
          <section className="sect">
            {list.length > 0 && (
              <div className="row" style={{ margin: '2px 0 8px' }}>
                <div className="grow mute">Swipe a split: a little marks it read or unread, further dismisses it.</div>
                <button className="linkbtn" onClick={bulk}>{unread ? 'Mark all read' : 'Dismiss all'}</button>
              </div>
            )}
            <div className="sscroll">
              {list.length ? list.map((n) => <NotifRow key={n.id} n={n} onOpen={() => open(n)} onToggle={() => toggle(n)} onDismiss={() => dismiss(n)} />) : <Empty title="All quiet">You'll see it here when someone adds, tags or reminds you.</Empty>}
            </div>
          </section>
        ) : (
          <section className="sect">
            <div className="row" style={{ margin: '2px 0 8px' }}>
              <input placeholder="Search notes, or type a title and tap + New" maxLength={40} aria-label="Search notes" value={q} onChange={(e) => setQ(e.target.value)} />
              <button className="primary" style={{ width: 'auto', padding: '12px 18px', whiteSpace: 'nowrap' }} onClick={() => sheet.open('New note', (close) => <NoteSheet ctx="n" gid={null} title={q.trim()} close={close} />)}>+ New</button>
            </div>
            <div className="chiprow" role="group" aria-label="Filter notes by group">
              <button className={`fchip plain${f === 'all' ? ' on' : ''}`} aria-pressed={f === 'all'} onClick={() => setFilter('all')}>All</button>
              <button className={`fchip${f === 'n' ? ' on' : ''}`} aria-pressed={f === 'n'} onClick={() => setFilter('n')}>
                <Avatar pid="me" size={26} />
                Just me
              </button>
              {groups.map((g) => (
                <button key={g.id} className={`fchip${f === `g:${g.id}` ? ' on' : ''}`} aria-pressed={f === `g:${g.id}`} onClick={() => setFilter(`g:${g.id}`)}>
                  <Bullet letter={letterOf(g.name ?? '?')} color={g.color ?? '#A7A9AC'} size={26} />
                  {g.name}
                </button>
              ))}
            </div>
            <div className="sscroll" id="notes-box">
              <NoteCards ctx="n" gid={null} q={q} filter={f} />
            </div>
          </section>
        )}
      </div>
    </Screen>
  )
}

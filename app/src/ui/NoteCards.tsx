import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import * as A from '../data/actions'
import { useAppState, useStore } from '../data/store'
import { allNoteEntries, isDone, letterOf, groupGlyph, noteEntries, noteKey, type NoteEntry, type NoteFilter } from '../domain/selectors'
import { ME } from '../domain/types'
import { COLORS, ago, ink } from '../domain/util'
import { NoteSheet } from '../sheets/NoteSheet'
import { Bullet, Empty } from './bits'
import { useSheet } from './Sheet'
import { useToast } from './Toast'

function noteColor(e: NoteEntry): string {
  if (e.ctx === 'g' && e.ledger?.color) return e.ledger.color
  let h = 0
  for (const c of e.n.id) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return COLORS[h % COLORS.length]
}

/** Lists and notes: preview cards, instant ticks, archive when done, and (for personal notes) long-press to reorder or hide. */
export function NoteCards({ ctx, gid, q, filter = 'all' }: { ctx: 'n' | 'g'; gid: string | null; q: string; filter?: NoteFilter }) {
  const s = useAppState()
  const store = useStore()
  const sheet = useSheet()
  const toast = useToast()
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [showHidden, setShowHidden] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const swallow = useRef(false)

  const all = noteEntries(s, ctx, gid, q, filter)
  const hiddenEntries = ctx === 'n' ? all.filter((e) => s.hidden.includes(noteKey(e))) : []
  const shown = ctx === 'n' ? all.filter((e) => !s.hidden.includes(noteKey(e))) : all
  const total = ctx === 'n' ? s.notes.length : (s.ledgers.find((l) => l.id === gid)?.lists.length ?? 0)

  // A note that just became done stays where it is for a moment, then slides into Done.
  const doneNow = useMemo(() => Object.fromEntries(all.map((e) => [e.n.id, isDone(e.n)])), [all])
  const sig = JSON.stringify(doneNow)
  const [settled, setSettled] = useState<Record<string, boolean>>(doneNow)
  useEffect(() => {
    const t = setTimeout(() => {
      setSettled(doneNow)
      setOpen((o) => {
        const next = { ...o }
        for (const id of Object.keys(doneNow)) if (doneNow[id] !== settled[id]) delete next[id]
        return next
      })
    }, 700)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig])
  const doneFor = (e: NoteEntry) => (e.n.id in settled ? settled[e.n.id] : doneNow[e.n.id])

  const active = shown.filter((e) => !doneFor(e))
  const done = shown.filter((e) => doneFor(e))

  const openEdit = (e: NoteEntry) => sheet.open(e.ctx === 'n' ? 'Edit note' : 'Edit list', (close) => <NoteSheet ctx={e.ctx} gid={e.gid} id={e.n.id} close={close} />)
  const openManage = (key: string) =>
    sheet.open('Manage', (close) => <ManageSheet k={key} close={close} onEdit={(e) => { close(); setTimeout(() => openEdit(e), 120) }} />)

  // ----- long press, then drag to reorder (personal notes only) -----
  type Rect = { el: HTMLElement; key: string; top: number; h: number }
  const lp = useRef<{ el: HTMLElement; key: string; x0: number; y0: number; active: boolean; moved: boolean; rects: Rect[]; idx: number; newIdx: number } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const onDown = (e: RPointerEvent) => {
    if (ctx !== 'n' || e.button > 0) return
    const t = e.target as HTMLElement
    const card = t.closest<HTMLElement>('.ncard')
    if (!card || t.closest('button')) return
    lp.current = { el: card, key: card.dataset.key as string, x0: e.clientX, y0: e.clientY, active: false, moved: false, rects: [], idx: 0, newIdx: 0 }
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const L = lp.current
      if (!L || L.active || !box.current) return
      L.active = true
      const cards = [...box.current.querySelectorAll<HTMLElement>(':scope > .ncard')]
      L.rects = cards.map((c) => {
        const r = c.getBoundingClientRect()
        return { el: c, key: c.dataset.key as string, top: r.top, h: r.height }
      })
      L.idx = cards.indexOf(L.el)
      L.newIdx = L.idx
      L.el.classList.add('lifted')
      navigator.vibrate?.(10)
    }, 450)
  }
  const onMove = (e: RPointerEvent) => {
    const L = lp.current
    if (!L) return
    const dy = e.clientY - L.y0
    const dx = e.clientX - L.x0
    if (!L.active) {
      if (Math.abs(dy) > 8 || Math.abs(dx) > 8) {
        clearTimeout(timer.current)
        lp.current = null
      }
      return
    }
    if (Math.abs(dy) > 6) L.moved = true
    L.el.style.transform = `translateY(${dy}px) scale(1.02)`
    const me = L.rects[L.idx]
    const center = me.top + me.h / 2 + dy
    let n = 0
    L.rects.forEach((r, i) => {
      if (i !== L.idx && r.top + r.h / 2 < center) n++
    })
    L.newIdx = n
    const shift = me.h + 10
    L.rects.forEach((r, i) => {
      if (i === L.idx) return
      const t = L.idx < i && i <= L.newIdx ? -shift : L.newIdx <= i && i < L.idx ? shift : 0
      r.el.style.transition = 'transform .15s'
      r.el.style.transform = t ? `translateY(${t}px)` : ''
    })
  }
  const end = (cancel: boolean) => {
    clearTimeout(timer.current)
    const L = lp.current
    lp.current = null
    if (!L || !L.active) return
    L.el.classList.remove('lifted')
    L.el.style.transform = ''
    L.rects.forEach((r) => {
      r.el.style.transform = ''
      r.el.style.transition = ''
    })
    swallow.current = true
    setTimeout(() => (swallow.current = false), 150)
    if (cancel) return
    if (L.moved) {
      const keys = L.rects.map((r) => r.key)
      keys.splice(L.idx, 1)
      keys.splice(L.newIdx, 0, L.key)
      store.update((st) => A.setNoteOrder(st, keys))
      toast('Order saved')
    } else openManage(L.key)
  }
  useEffect(() => {
    const block = (e: TouchEvent) => lp.current?.active && e.preventDefault()
    document.addEventListener('touchmove', block, { passive: false })
    return () => document.removeEventListener('touchmove', block)
  }, [])

  const tick = (e: NoteEntry, itemId: string) => store.update((st) => A.toggleNoteItem(st, { ctx: e.ctx, gid: e.gid }, e.n.id, itemId, ME))

  const card = (e: NoteEntry) => {
    const n = e.n
    const col = noteColor(e)
    const isOpen = !!open[n.id]
    const dn = n.items.filter((x) => x.done).length
    const untick = n.items.filter((x) => !x.done)
    const rows = isOpen ? [...n.items].sort((a, b) => Number(a.done) - Number(b.done)) : untick.slice(0, 3)
    const hidden = n.items.length - rows.length
    const toggle = () => setOpen({ ...open, [n.id]: !isOpen })
    return (
      <div className="card ncard" data-key={noteKey(e)} key={noteKey(e)} style={{ ['--nc' as string]: col, ['--nct' as string]: ink(col) }}>
        <div className="row">
          <div className="tap grow" role="button" tabIndex={0} aria-expanded={isOpen} aria-label={`${n.title}. Press M to manage.`} onClick={toggle}
            onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') toggle(); if ((ev.key === 'm' || ev.key === 'M') && ctx === 'n') { ev.preventDefault(); openManage(noteKey(e)) } }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <b>{n.title}</b>
              {e.tag && e.ledger && <span className="gtag"><Bullet letter={groupGlyph(e.ledger)} color={e.ledger.color ?? '#A7A9AC'} size={16} />{e.ledger.name}</span>}
            </div>
            <div className="mute">{n.items.length ? `${dn} of ${n.items.length} ticked · ` : ''}{ago(n.ts)}</div>
          </div>
          <button className="linkbtn" onClick={() => openEdit(e)}>Edit ›</button>
        </div>
        {n.memo && <div className={`memo${isOpen ? '' : ' clamp'}`}>{n.memo}</div>}
        {rows.length > 0 && (
          <div style={{ marginTop: 6 }}>
            {rows.map((x) => (
              <div className="row" style={{ padding: '5px 0' }} key={x.id}>
                <button className={`chk${x.done ? ' on' : ''}`} aria-pressed={x.done} aria-label={`${x.done ? 'Untick' : 'Tick'} ${x.t}`} onClick={() => tick(e, x.id)}>{x.done ? '✓' : ''}</button>
                <div className="grow">
                  <span className={x.done ? 'done' : ''}>{x.t}</span>
                  <div className="gb mute" style={{ fontSize: 12 }}>{x.done && e.ctx === 'g' && x.doneBy ? `got by ${x.doneBy === ME ? 'You' : s.people[x.doneBy]?.name}` : ''}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        {hidden > 0 && <button className="linkbtn" onClick={toggle}>Show all {n.items.length} ⌄</button>}
        {hidden <= 0 && isOpen && n.items.length > 3 && <button className="linkbtn" onClick={toggle}>Show less ⌃</button>}
      </div>
    )
  }

  const arch = (e: NoteEntry) => {
    const col = noteColor(e)
    return (
      <div key={noteKey(e)} className="card tap row arch" role="button" tabIndex={0} style={{ ['--nc' as string]: col, ['--nct' as string]: ink(col) }}
        aria-label={`${e.n.title}, all done. Tap to reveal.`} onClick={() => setOpen({ ...open, [e.n.id]: true })} onKeyDown={(ev) => ev.key === 'Enter' && setOpen({ ...open, [e.n.id]: true })}>
        <span className="chk on" aria-hidden="true">✓</span>
        <div className="grow"><b>{e.n.title}</b></div>
        <span className="mute">all {e.n.items.length} done</span>
      </div>
    )
  }

  if (!active.length && !done.length && !hiddenEntries.length) {
    return (
      <Empty small title={total || filter !== 'all' ? 'No match' : ctx === 'n' ? 'No notes yet' : 'No lists yet'}>
        {total || filter !== 'all'
          ? filter !== 'all' ? 'Nothing here for this filter. Tap All to see everything.' : `Tap + ${ctx === 'n' ? 'New' : 'Create'} to start one called “${q.trim()}”.`
          : ctx === 'n' ? 'Make a shopping list or a quick memo, just for you.' : 'Make one per store or task, like Costco or Cleaning day.'}
      </Empty>
    )
  }

  return (
    <div ref={box} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={() => end(false)} onPointerCancel={() => end(true)}
      onClickCapture={(e) => { if (swallow.current) { e.stopPropagation(); e.preventDefault() } }}>
      {active.map(card)}
      {done.length > 0 && (
        <>
          <h2 style={{ margin: '14px 0 8px' }}>Done · {done.length}</h2>
          {done.map((e) => (open[e.n.id] ? card(e) : arch(e)))}
        </>
      )}
      {hiddenEntries.length > 0 && (
        <>
          <div className="row" style={{ margin: '14px 0 8px' }}>
            <h2 style={{ margin: 0, flex: 1 }}>Hidden · {hiddenEntries.length}</h2>
            <button className="linkbtn" aria-expanded={showHidden} onClick={() => setShowHidden(!showHidden)}>{showHidden ? 'Hide' : 'Show'}</button>
          </div>
          {showHidden &&
            hiddenEntries.map((e) => (
              <div className="card row" key={noteKey(e)} style={{ borderLeft: `6px solid ${noteColor(e)}` }}>
                <div className="grow">
                  <b>{e.n.title}</b>{' '}
                  {e.tag && e.ledger && <span className="gtag"><Bullet letter={groupGlyph(e.ledger)} color={e.ledger.color ?? '#A7A9AC'} size={16} />{e.ledger.name}</span>}
                </div>
                <button className="linkbtn" onClick={() => { store.update((st) => A.toggleNoteHidden(st, noteKey(e))); toast('Back in your Short notes') }}>Unhide</button>
              </div>
            ))}
        </>
      )}
    </div>
  )
}

function ManageSheet({ k, close, onEdit }: { k: string; close: () => void; onEdit: (e: NoteEntry) => void }) {
  const s = useAppState()
  const store = useStore()
  const toast = useToast()
  const e = allNoteEntries(s).find((x) => noteKey(x) === k)
  if (!e) return <button className="secondary" onClick={close}>Close</button>
  const hid = s.hidden.includes(k)
  const col = noteColor(e)
  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <Bullet letter={letterOf(e.n.title || '?')} color={col} size={34} />
        <div className="grow">
          <b>{e.n.title}</b>
          <div className="mute">{e.tag ? `${e.ledger?.name} · group list` : 'Personal note'}</div>
        </div>
      </div>
      <button className="primary" onClick={() => { store.update((st) => A.moveNoteToTop(st, k)); close(); toast('Moved to top') }}>Move to top</button>
      <div style={{ height: 10 }} />
      <button className="secondary" onClick={() => { store.update((st) => A.toggleNoteHidden(st, k)); close(); toast(hid ? 'Back in your Short notes' : 'Hidden for now. Find it under Hidden at the bottom.') }}>{hid ? 'Unhide' : 'Hide for now'}</button>
      <div style={{ height: 10 }} />
      <button className="secondary" onClick={() => onEdit(e)}>Edit</button>
      <div style={{ height: 10 }} />
      <button className="secondary" onClick={close}>Cancel</button>
      <p className="mute" style={{ marginTop: 10 }}>{e.tag ? 'Hiding only removes it from your Short notes. The list stays in the group.' : 'Hidden notes wait under Hidden at the bottom.'}</p>
    </>
  )
}

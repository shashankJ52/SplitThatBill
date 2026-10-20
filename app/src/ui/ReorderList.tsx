import { useEffect, useRef, type KeyboardEvent, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import { isSwipe, landingIndex, moveKey, shiftFor } from './reorder'

export interface ReorderItem {
  key: string
  /** the row itself; give it the classes "card tap row ncf" so it can slide */
  node: ReactNode
  /** may be swiped away */
  swipe?: boolean
}

const HOLD_MS = 450
const SWIPE_AT = 90

interface Rect { wrap: HTMLElement; key: string; top: number; h: number }
interface Gesture {
  wrap: HTMLElement
  face: HTMLElement
  key: string
  x0: number
  y0: number
  id: number
  mode: 'wait' | 'lift' | 'swipe'
  dx: number
  moved: boolean
  rects: Rect[]
  idx: number
  newIdx: number
}

/**
 * A list of rows you can rearrange by pressing and holding, then dragging, and (for the rows that allow it) dismiss by
 * swiping sideways. Alt with the up or down arrow moves the focused row, and Delete dismisses a swipeable one.
 */
export function ReorderList({ items, onReorder, onDismiss, dismissLabel = 'Dismiss' }: {
  items: ReorderItem[]
  onReorder?: (keys: string[]) => void
  onDismiss?: (key: string) => void
  dismissLabel?: string
}) {
  const box = useRef<HTMLDivElement>(null)
  const g = useRef<Gesture | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const swallow = useRef(false)
  const swipeable = (key: string) => !!items.find((i) => i.key === key)?.swipe && !!onDismiss

  const swallowClick = () => {
    swallow.current = true
    setTimeout(() => (swallow.current = false), 150)
  }

  const down = (e: RPointerEvent) => {
    if (e.button > 0) return
    const t = e.target as HTMLElement
    const wrap = t.closest<HTMLElement>('.nc[data-rl-key]')
    if (!wrap || t.closest('button')) return
    const face = wrap.querySelector<HTMLElement>('.ncf') ?? wrap
    g.current = { wrap, face, key: wrap.dataset.rlKey as string, x0: e.clientX, y0: e.clientY, id: e.pointerId, mode: 'wait', dx: 0, moved: false, rects: [], idx: 0, newIdx: 0 }
    clearTimeout(timer.current)
    if (!onReorder) return
    timer.current = setTimeout(() => {
      const cur = g.current
      if (!cur || cur.mode !== 'wait' || !box.current) return
      cur.mode = 'lift'
      const wraps = [...box.current.querySelectorAll<HTMLElement>(':scope > .nc[data-rl-key]')]
      cur.rects = wraps.map((w) => {
        const r = w.getBoundingClientRect()
        return { wrap: w, key: w.dataset.rlKey as string, top: r.top, h: r.height }
      })
      cur.idx = wraps.indexOf(cur.wrap)
      cur.newIdx = cur.idx
      cur.wrap.classList.add('lifted')
      navigator.vibrate?.(10)
    }, HOLD_MS)
  }

  const move = (e: RPointerEvent) => {
    const c = g.current
    if (!c) return
    const dx = e.clientX - c.x0
    const dy = e.clientY - c.y0
    if (c.mode === 'wait') {
      if (isSwipe(dx, dy) && swipeable(c.key)) {
        clearTimeout(timer.current)
        c.mode = 'swipe'
        c.face.style.transition = 'none'
        try {
          c.face.setPointerCapture(c.id)
        } catch {
          /* the pointer is already gone */
        }
      } else if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        // an ordinary scroll or a tap that wandered: let the browser have it
        clearTimeout(timer.current)
        g.current = null
      }
      if (c.mode === 'wait') return
    }
    if (c.mode === 'swipe') {
      c.dx = dx
      c.face.style.transform = `translateX(${dx}px)`
      c.wrap.dataset.tier = Math.abs(dx) >= SWIPE_AT ? '2' : '0'
      c.wrap.dataset.dir = dx < 0 ? 'l' : 'r'
      return
    }
    // lifted: follow the finger and make room
    if (Math.abs(dy) > 6) c.moved = true
    c.wrap.style.transform = `translateY(${dy}px) scale(1.02)`
    c.newIdx = landingIndex(c.rects.map((r) => ({ top: r.top, height: r.h })), c.idx, dy)
    const step = c.rects[c.idx].h + 10
    c.rects.forEach((r, i) => {
      if (i === c.idx) return
      const shift = shiftFor(i, c.idx, c.newIdx, step)
      r.wrap.style.transition = 'transform .15s'
      r.wrap.style.transform = shift ? `translateY(${shift}px)` : ''
    })
  }

  const end = (cancel: boolean) => {
    clearTimeout(timer.current)
    const c = g.current
    g.current = null
    if (!c) return
    if (c.mode === 'swipe') {
      swallowClick()
      c.face.style.transition = 'transform .25s var(--ease)'
      if (!cancel && Math.abs(c.dx) >= SWIPE_AT) {
        c.face.style.transform = `translateX(${c.dx < 0 ? '-110%' : '110%'})`
        setTimeout(() => onDismiss?.(c.key), 220)
      } else {
        c.face.style.transform = ''
        c.wrap.dataset.tier = '0'
      }
      return
    }
    if (c.mode !== 'lift') return
    c.wrap.classList.remove('lifted')
    c.wrap.style.transform = ''
    c.rects.forEach((r) => {
      r.wrap.style.transform = ''
      r.wrap.style.transition = ''
    })
    swallowClick()
    if (!cancel && c.moved && c.newIdx !== c.idx) onReorder?.(moveKey(c.rects.map((r) => r.key), c.key, c.newIdx))
  }

  // while a row is lifted the page must not scroll under the finger
  useEffect(() => {
    const block = (e: TouchEvent) => g.current?.mode === 'lift' && e.preventDefault()
    document.addEventListener('touchmove', block, { passive: false })
    return () => {
      document.removeEventListener('touchmove', block)
      clearTimeout(timer.current)
    }
  }, [])

  const key = (e: KeyboardEvent) => {
    const wrap = (e.target as HTMLElement).closest<HTMLElement>('.nc[data-rl-key]')
    if (!wrap) return
    const k = wrap.dataset.rlKey as string
    const keys = items.map((i) => i.key)
    const at = keys.indexOf(k)
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && onReorder) {
      e.preventDefault()
      const to = at + (e.key === 'ArrowUp' ? -1 : 1)
      if (to >= 0 && to < keys.length) onReorder(moveKey(keys, k, to))
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && swipeable(k)) {
      e.preventDefault()
      onDismiss?.(k)
    }
  }

  return (
    <div
      ref={box}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={() => end(false)}
      onPointerCancel={() => end(true)}
      onClickCapture={(e) => swallow.current && (e.preventDefault(), e.stopPropagation())}
      onKeyDown={key}
    >
      {items.map((it) => (
        <div className="nc" key={it.key} data-rl-key={it.key} data-tier="0">
          <div className="ncbg" aria-hidden="true">
            <span className="t2">{dismissLabel}</span>
          </div>
          {it.node}
        </div>
      ))}
    </div>
  )
}

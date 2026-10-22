import { useRef, type KeyboardEvent, type PointerEvent } from 'react'
import { clampSide, saveSideWidth, setSideWidth, SIDE_MAX, SIDE_MIN } from './sideWidth'

const STEP = 16

/**
 * The thin line on the sidebar's right edge. Drag it to make the sidebar wider (to read long names) or narrower, use the
 * left and right arrow keys when it is focused, or double-click it to go back to the usual width.
 */
export function SideGrip() {
  const start = useRef<{ x: number; w: number } | null>(null)
  const width = () => (document.getElementById('tabbar')?.getBoundingClientRect().width ?? SIDE_MIN)

  const down = (e: PointerEvent<HTMLDivElement>) => {
    start.current = { x: e.clientX, w: width() }
    e.currentTarget.setPointerCapture(e.pointerId)
    document.body.classList.add('resizing')
  }
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (start.current) setSideWidth(start.current.w + e.clientX - start.current.x)
  }
  const up = (e: PointerEvent<HTMLDivElement>) => {
    if (!start.current) return
    saveSideWidth(start.current.w + e.clientX - start.current.x)
    start.current = null
    document.body.classList.remove('resizing')
  }
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const w = clampSide(width() + (e.key === 'ArrowRight' ? STEP : -STEP))
    setSideWidth(w)
    saveSideWidth(w)
  }
  return (
    <div
      className="side-grip"
      role="separator"
      aria-orientation="vertical"
      aria-label="Sidebar width. Drag, or use the left and right arrow keys."
      aria-valuemin={SIDE_MIN}
      aria-valuemax={SIDE_MAX}
      aria-valuenow={Math.round(typeof document === 'undefined' ? SIDE_MIN : width())}
      tabIndex={0}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onKeyDown={key}
      onDoubleClick={() => {
        setSideWidth(null)
        saveSideWidth(null)
      }}
    />
  )
}

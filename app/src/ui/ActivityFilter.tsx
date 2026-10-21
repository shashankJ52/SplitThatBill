import { useEffect, useRef, useState } from 'react'
import { ACTIVITY_KINDS, type ActivityKind } from '../domain/selectors'

/** A small funnel button that picks what the activity list shows: everything, bills, or settle-ups. */
export function ActivityFilter({ value, onChange }: { value: ActivityKind; onChange: (v: ActivityKind) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('click', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('click', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])
  const label = ACTIVITY_KINDS.find((k) => k.value === value)?.label ?? 'Everything'
  return (
    <div className="dd afilter" ref={ref}>
      <button type="button" className={`iconbtn${value !== 'all' ? ' on' : ''}`} aria-haspopup="menu" aria-expanded={open} aria-label={`Filter activity: ${label}`} title={`Showing: ${label}`} onClick={() => setOpen((o) => !o)}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3.5 5h17l-6.5 7.8V19l-4 2v-8.2z" />
        </svg>
      </button>
      {open && (
        <div className="ddm" role="menu" aria-label="Filter activity">
          {ACTIVITY_KINDS.map((k) => (
            <button key={k.value} type="button" role="menuitemradio" aria-checked={k.value === value} className={`ddo${k.value === value ? ' on' : ''}`} onClick={() => { setOpen(false); onChange(k.value) }}>
              <span className="grow">{k.label}</span>
              {k.value === value && <span aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

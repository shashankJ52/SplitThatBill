import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronIcon } from './icons'

export interface Option<T extends string> {
  value: T
  label: string
  icon: ReactNode
  sub?: string
}

/** Route-bullet dropdown used instead of native selects. */
export function Dropdown<T extends string>({
  value, options, onChange, label,
}: { value: T; options: Option<T>[]; onChange: (v: T) => void; label: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const cur = options.find((o) => o.value === value) ?? options[0]

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('click', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="dd" ref={ref}>
      <button type="button" className="ddb" aria-haspopup="listbox" aria-expanded={open} aria-label={`${label}: ${cur.label}`} onClick={() => setOpen((o) => !o)}>
        {cur.icon}
        <span className="grow">{cur.label}</span>
        <span className="mute"><ChevronIcon /></span>
      </button>
      {open && (
        <div className="ddm" role="listbox" aria-label={label}>
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              className={`ddo${o.value === value ? ' on' : ''}`}
              onClick={() => {
                setOpen(false)
                onChange(o.value)
              }}
            >
              {o.icon}
              <span className="grow">
                {o.label}
                {o.sub && <span className="mute"> {o.sub}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

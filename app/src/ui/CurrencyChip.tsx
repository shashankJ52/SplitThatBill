import { useEffect, useRef, useState } from 'react'
import { currencyLabel } from '../domain/currency'
import { ChevronIcon } from './icons'

/**
 * A small "USD" button with a chevron that opens a short menu of currencies right under it. It is a menu, not a sheet, so it also works
 * inside a sheet without closing it.
 */
export function CurrencyChip({ value, options, onPick, label = 'Change currency' }: { value: string; options: string[]; onPick: (code: string) => void; label?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('click', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="chipw" ref={ref}>
      <button type="button" className="secondary pillb chipb" aria-haspopup="listbox" aria-expanded={open} aria-label={`${label}. Showing ${value}`} onClick={() => setOpen((o) => !o)}>
        {value} <ChevronIcon />
      </button>
      {open && (
        <div className="chipm" role="listbox" aria-label={label}>
          {options.map((code) => (
            <button key={code} type="button" role="option" aria-selected={code === value} className={code === value ? 'on' : ''} onClick={() => { setOpen(false); onPick(code) }}>
              <span className="grow">{currencyLabel(code)}</span>
              {code === value && <span aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

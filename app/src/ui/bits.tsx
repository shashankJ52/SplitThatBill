import type { CSSProperties, ReactNode } from 'react'
import { useAppState } from '../data/store'
import { personName } from '../domain/selectors'
import { COLORS, ink } from '../domain/util'

export function Bullet({ letter, color, size = 40, ring }: { letter: string; color: string; size?: number; ring?: boolean }) {
  const style = { '--c': color, '--t': ink(color), '--s': `${size}px` } as CSSProperties
  return (
    <span className={`bullet${ring ? ' ring' : ''}`} style={style} aria-hidden="true">
      {letter}
    </span>
  )
}

/** A colored bullet with a person's initial. The color is stable per person. */
export function Avatar({ pid, size = 32 }: { pid: string; size?: number }) {
  const s = useAppState()
  const i = Object.keys(s.people).indexOf(pid)
  const color = COLORS[(i < 0 ? 0 : i * 2 + 1) % COLORS.length]
  return <Bullet letter={personName(s, pid).charAt(0).toUpperCase()} color={color} size={size} />
}

export function personColor(people: Record<string, unknown>, pid: string): string {
  const i = Object.keys(people).indexOf(pid)
  return COLORS[(i < 0 ? 0 : i * 2 + 1) % COLORS.length]
}

export function Seg<T extends string>({
  value, options, onChange, className = '', label,
}: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; className?: string; label?: string }) {
  return (
    <div className={`seg ${className}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className={o.value === value ? 'on' : ''} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Stepper({ value, onMinus, onPlus, label, text }: { value: string; onMinus: () => void; onPlus: () => void; label: string; text?: string }) {
  return (
    <div className="stepper">
      <button type="button" onClick={onMinus} aria-label={`Less ${label}`}>−</button>
      <b aria-label={text}>{value}</b>
      <button type="button" onClick={onPlus} aria-label={`More ${label}`}>+</button>
    </div>
  )
}

export function Empty({ title, children, small }: { title: string; children?: ReactNode; small?: boolean }) {
  return (
    <div className={`empty${small ? ' sm' : ''}`}>
      <b>{title}</b>
      {children}
    </div>
  )
}

export function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 17v-6a6 6 0 0112 0v6l1.5 2h-15zM10 21a2 2 0 004 0" />
    </svg>
  )
}

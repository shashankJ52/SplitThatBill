import type { ReactNode } from 'react'

export function MonthBar({ label, sub, onPrev, onNext, canPrev, canNext, right }: { label: string; sub: string; onPrev: () => void; onNext: () => void; canPrev: boolean; canNext: boolean; right?: ReactNode }) {
  return (
    <div className="row mbar">
      <button className="mnav" onClick={onPrev} disabled={!canPrev} aria-label="Previous month">‹</button>
      <div className="grow" style={{ textAlign: 'center' }}>
        <b>{label}</b>
        <div className="mute">{sub}</div>
      </div>
      <button className="mnav" onClick={onNext} disabled={!canNext} aria-label="Next month">›</button>
      {right}
    </div>
  )
}

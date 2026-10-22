import { useState } from 'react'

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * A second step before something that cannot be undone: explain what is lost, and only enable the red button once the
 * person has typed the name (or word) shown. Typing it is the friction that stops an accidental tap.
 */
export function TypeToConfirm({ title, body, word, confirmLabel, keepLabel = 'Keep it', onConfirm, onCancel }: {
  title: string
  body: string
  /** what must be typed, for example the group's name */
  word: string
  confirmLabel: string
  keepLabel?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const [typed, setTyped] = useState('')
  const ok = same(typed, word)
  return (
    <div className="card" style={{ display: 'block' }}>
      <b>{title}</b>
      <p className="mute">{body}</p>
      <label className="f" htmlFor="ttc-input" style={{ marginTop: 0 }}>Type “{word}” to confirm</label>
      <input id="ttc-input" autoComplete="off" autoCapitalize="none" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={word} onKeyDown={(e) => e.key === 'Enter' && ok && onConfirm()} />
      <div style={{ height: 10 }} />
      <button className="primary" style={{ background: 'var(--red)', borderColor: 'var(--red)', color: '#fff' }} disabled={!ok} onClick={onConfirm}>{confirmLabel}</button>
      <div style={{ height: 8 }} />
      <button className="secondary" onClick={onCancel}>{keepLabel}</button>
    </div>
  )
}

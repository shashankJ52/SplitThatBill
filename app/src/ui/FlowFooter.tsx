import { createPortal } from 'react-dom'
import { useFooterEl } from '../app/Shell'

/** The big button at the bottom of the split steps. */
export function FlowFooter({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  const el = useFooterEl()
  if (!el) return null
  return createPortal(
    <button className="primary" onClick={onClick} disabled={disabled}>
      {label}
    </button>,
    el,
  )
}

import type { ReactNode } from 'react'

/** Something is being fetched: a small spinner and, when it helps, a line saying what. */
export function Loading({ children }: { children?: ReactNode }) {
  return (
    <div className="loading" role="status" aria-live="polite">
      <span className="spin" aria-hidden="true" />
      {children ? <span>{children}</span> : <span className="sr">Loading</span>}
    </div>
  )
}

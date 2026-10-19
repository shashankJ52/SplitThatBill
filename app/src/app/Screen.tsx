import { type ReactNode } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

/** One page of the app. Slides in from the right when you go forward, from the left when you go back. */
export function Screen({ id, children }: { id: string; children: ReactNode }) {
  const loc = useLocation()
  const type = useNavigationType()
  const anim = (loc.state as { anim?: string } | null)?.anim ?? (type === 'POP' ? 'back' : type === 'PUSH' ? 'fwd' : 'fade')
  return (
    <section className={`view on enter-${anim}`} id={id}>
      {children}
    </section>
  )
}

import { lazy, Suspense } from 'react'
import { Navigate } from 'react-router-dom'
import { useAppState } from '../data/store'

const Landing = lazy(() => import('../landing/Landing'))

/**
 * The front door, at "/" and "/welcome". Signed in: the app. Signed out: the landing page with the subway line, in a
 * browser tab and in the installed app alike (the install steps are left out once it is installed).
 */
export function Home() {
  const s = useAppState()
  if (s.signedIn) return <Navigate to="/groups" replace />
  return (
    <Suspense fallback={null}>
      <Landing />
    </Suspense>
  )
}

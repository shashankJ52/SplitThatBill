import { lazy, Suspense } from 'react'
import { Navigate } from 'react-router-dom'
import { useAppState } from '../data/store'
import { isStandalone } from './install'

const Landing = lazy(() => import('../landing/Landing'))

/**
 * What "/" shows. Signed in: the app. Opened from the home screen and signed out: the intro slides, since the person
 * has already installed it and only needs to log in or sign up. In a browser tab and signed out: the landing page.
 */
export function Home() {
  const s = useAppState()
  if (s.signedIn) return <Navigate to="/groups" replace />
  if (isStandalone()) return <Navigate to="/welcome" replace />
  return (
    <Suspense fallback={null}>
      <Landing />
    </Suspense>
  )
}

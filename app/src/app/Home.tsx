import { lazy, Suspense } from 'react'
import { Navigate } from 'react-router-dom'
import { useAppState } from '../data/store'
import { isStandalone } from './install'

const Landing = lazy(() => import('../landing/Landing'))

/**
 * The front door, at "/" and "/welcome".
 * - Signed in: the app.
 * - Opened from the home screen and signed out: the log in page. Someone who installed the app does not need the website.
 * - In a browser tab (a search result, a link, a desktop visit) and signed out: the landing page.
 */
/** The full website at "/home", for anyone: signed in or not, installed or not. Signed in, the top right shows your name. */
export function Website() {
  return (
    <Suspense fallback={null}>
      <Landing />
    </Suspense>
  )
}

export function Home() {
  const s = useAppState()
  if (s.signedIn) return <Navigate to="/groups" replace />
  if (isStandalone()) return <Navigate to="/login" replace />
  return (
    <Suspense fallback={null}>
      <Landing />
    </Suspense>
  )
}

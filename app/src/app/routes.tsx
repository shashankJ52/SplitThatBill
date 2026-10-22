import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { Home, Website } from './Home'
import { FlowProvider } from '../flow/FlowProvider'
import { BillPage } from '../screens/BillPage'
import { GroupPage } from '../screens/GroupPage'
import { GroupsTab } from '../screens/GroupsTab'
import { PersonPage } from '../screens/PersonPage'
import { JoinPage } from '../screens/JoinPage'
import { PublicBill } from '../screens/PublicBill'
import { PublicBillLink } from '../screens/PublicBillLink'
import { SheetProvider } from '../ui/Sheet'
import { ToastProvider } from '../ui/Toast'
import { Assign } from '../screens/flow/Assign'
import { Capture } from '../screens/flow/Capture'
import { Details } from '../screens/flow/Details'
import { DraftPreview } from '../screens/flow/DraftPreview'
import { Export } from '../screens/flow/Export'
import { Privacy } from '../screens/flow/Privacy'
import { Review } from '../screens/flow/Review'
import { Summary } from '../screens/flow/Summary'
import { AccountTab } from '../screens/AccountTab'
import { AlertsTab } from '../screens/AlertsTab'
import { useWide } from '../ui/useWide'
import { Forgot } from '../screens/auth/Forgot'
import { Login } from '../screens/auth/Login'
import { Reset } from '../screens/auth/Reset'
import { Signup } from '../screens/auth/Signup'
import { Verify } from '../screens/auth/Verify'
import { Shell } from './Shell'

/** On a phone one Alerts tab holds splits and short notes; on a laptop or iPad each has its own entry in the sidebar. */
function AlertsRoute() {
  return <AlertsTab only={useWide() ? 'splits' : undefined} />
}

const AdminPage = lazy(() => import('../admin/Admin'))
const LegalPrivacy = lazy(() => import('../landing/Legal').then((m) => ({ default: m.Privacy })))
const LegalTerms = lazy(() => import('../landing/Legal').then((m) => ({ default: m.Terms })))

export const router = createBrowserRouter([
  // the public front door and the legal pages live outside the app shell: they scroll and are wider than the app
  { path: '/', element: <Home /> },
  { path: '/welcome', element: <Home /> },
  { path: '/home', element: <Website /> },
  // private page for the person who runs the app; not linked from anywhere
  { path: '/admin', element: <Suspense fallback={null}><AdminPage /></Suspense> },
  { path: '/privacy', element: <Suspense fallback={null}><LegalPrivacy /></Suspense> },
  { path: '/terms', element: <Suspense fallback={null}><LegalTerms /></Suspense> },
  {
    // Providers live inside the router so sheets and toasts can use router hooks.
    element: (
      <ToastProvider>
        <SheetProvider>
          <FlowProvider>
            <Shell />
          </FlowProvider>
        </SheetProvider>
      </ToastProvider>
    ),
    children: [
      { path: '/groups', element: <GroupsTab /> },
      { path: '/groups/:gid', element: <GroupPage /> },
      { path: '/bill/:id', element: <BillPage /> },
      { path: '/person/:pid', element: <PersonPage /> },
      { path: '/join/:code', element: <JoinPage /> },
      { path: '/b/:token', element: <PublicBillLink /> },
      { path: '/preview/draft', element: <DraftPreview /> },
      { path: '/preview/:id', element: <PublicBill /> },
      { path: '/alerts', element: <AlertsRoute /> },
      { path: '/notes', element: <AlertsTab only="notes" /> },
      { path: '/account', element: <AccountTab /> },
      { path: '/scan', element: <Capture /> },
      { path: '/scan/privacy', element: <Privacy /> },
      { path: '/scan/review', element: <Review /> },
      { path: '/scan/assign', element: <Assign /> },
      { path: '/scan/details', element: <Details /> },
      { path: '/scan/summary', element: <Summary /> },
      { path: '/scan/export', element: <Export /> },
      { path: '/signup', element: <Signup /> },
      { path: '/verify', element: <Verify /> },
      { path: '/login', element: <Login /> },
      { path: '/forgot', element: <Forgot /> },
      { path: '/reset', element: <Reset /> },
      { path: '*', element: <Navigate to="/groups" replace /> },
    ],
  },
])

import { createContext, useContext, useEffect, useState, type CSSProperties } from 'react'
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAppState } from '../data/store'
import { unreadCount } from '../domain/selectors'
import { useFlow } from '../flow/FlowProvider'
import { useSheet } from '../ui/Sheet'
import { pendingFriendTag, pendingJoin, rememberFriendTag, rememberJoin } from './pendingJoin'
import { Bullet } from '../ui/bits'
import { SideGrip } from '../ui/SideGrip'
import { SideLines } from '../ui/SideLines'
import { useTheme } from '../ui/useTheme'
import { ThemeIcon } from '../ui/icons'

const TAB_ROOTS = ['/groups', '/alerts', '/notes', '/account']
const AUTH_ROUTES = ['/welcome', '/signup', '/login', '/forgot', '/verify', '/reset']
const FLOW_STEPS = ['/scan/privacy', '/scan/review', '/scan/assign', '/scan/details', '/scan/summary', '/scan/export']

const FooterCtx = createContext<HTMLElement | null>(null)
/** The element the flow screens put their main button into. */
export const useFooterEl = () => useContext(FooterCtx)

export function Shell() {
  const loc = useLocation()
  const nav = useNavigate()
  const s = useAppState()
  const { toggle } = useTheme()
  const sheet = useSheet()
  const flow = useFlow()
  const clearDraft = flow.clear
  const [footerEl, setFooterEl] = useState<HTMLElement | null>(null)
  const path = loc.pathname

  // a half-built split is dropped once you leave the flow (the draft preview is part of it)
  const inFlow = path.startsWith('/scan') || path === '/preview/draft'
  useEffect(() => {
    if (!inFlow) clearDraft()
  }, [inFlow, clearDraft])

  const isAuth = AUTH_ROUTES.includes(path)
  const isPublicLink = path.startsWith('/b/')
  const isPublic = path.startsWith('/preview') || isPublicLink
  if (!s.signedIn && !isAuth && !isPublicLink) {
    if (path.startsWith('/join/')) rememberJoin(path.slice('/join/'.length))
    if (path.startsWith('/u/')) rememberFriendTag(path.slice('/u/'.length))
    return <Navigate to="/welcome" replace />
  }
  // a group link opened before logging in is followed once there is an account to use it with
  const waiting = pendingJoin()
  if (s.signedIn && waiting && !path.startsWith('/join/') && !isAuth && !isPublicLink) return <Navigate to={`/join/${waiting}`} replace />
  // a friend's invite link opened before signing up is followed too, once there is an account
  const friendWaiting = pendingFriendTag()
  if (s.signedIn && friendWaiting && !waiting && !path.startsWith('/u/') && !isAuth && !isPublicLink) return <Navigate to={`/u/${friendWaiting}`} replace />
  if (s.signedIn && path === '/') return <Navigate to="/groups" replace />

  const isFlow = FLOW_STEPS.includes(path)
  const showTabs = !isAuth && !isPublic && !isFlow
  const showBack = !TAB_ROOTS.includes(path) && path !== '/welcome' && ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0
  const bb = showTabs ? '82px' : isFlow ? '94px' : '16px'
  const tab = path.startsWith('/alerts') ? 'alerts' : path.startsWith('/notes') ? 'notes' : path.startsWith('/account') ? 'account' : path.startsWith('/scan') ? 'scan' : 'groups'
  const unread = unreadCount(s)

  const goTab = (to: string) => nav(to, { replace: true, state: { anim: 'fade' } })
  const leave = () =>
    sheet.open(flow.draft?.editingId ? 'Discard your changes?' : 'Leave this split?', (close) => (
      <>
        <p className="mute">{flow.draft?.editingId ? "Your edits to this bill won't be saved." : "What you've entered so far will be lost."}</p>
        <button className="primary" onClick={close}>Keep going</button>
        <div style={{ height: 10 }} />
        <button
          className="secondary"
          onClick={() => {
            close()
            nav('/groups', { replace: true, state: { anim: 'fade' } })
          }}
        >
          {flow.draft?.editingId ? 'Discard changes' : 'Discard and go home'}
        </button>
      </>
    ))
  const startSplit = () => {
    if (path === '/scan') return
    const m = path.match(/^\/groups\/([^/]+)/)
    const p = path.match(/^\/person\/([^/]+)/)
    nav('/scan', { state: { target: m ? `g:${m[1]}` : p ? `p:${p[1]}` : path.startsWith('/personal') ? 'me' : null } })
  }

  return (
    <FooterCtx.Provider value={footerEl}>
      <div id="app" className={`${showTabs ? '' : 'noside'}${isFlow ? ' flow' : ''}`.trim()}>
        <div id="top">
          {showBack && (
            <button id="back" onClick={() => nav(-1)} aria-label="Back">
              ‹ Back
            </button>
          )}
          {!showBack && showTabs && (
            <div className="brand" aria-label="SplitThatBill, The Right Way">
              <Bullet letter="S" color="#FCCC0A" size={30} />
              <span><b>SplitThatBill</b><small>The Right Way</small></span>
            </div>
          )}
          <span className="spacer" />
          {isFlow && (
            <button id="home" onClick={leave} aria-label="Go home" title="Home">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3.5 11.5L12 4l8.5 7.5M6 10v9.5h4.5V14h3v5.5H18V10" />
              </svg>
            </button>
          )}
          <button id="theme" onClick={toggle} aria-label="Toggle light or dark mode">
            <ThemeIcon />
          </button>
        </div>
        <main id="main" style={{ '--bb': bb } as CSSProperties}>
          <Outlet key={path} />
        </main>
        <nav id="tabbar" className={showTabs ? '' : 'hide'} aria-label="Main">
          <div className="sidebrand" aria-hidden="true">
            <Bullet letter="S" color="#FCCC0A" size={38} />
            <span><b>SplitThatBill</b><small>The Right Way</small></span>
          </div>
          <button className={`tab${tab === 'groups' ? ' on' : ''}`} onClick={() => goTab('/groups')} aria-current={tab === 'groups' ? 'page' : undefined}>
            <svg viewBox="0 0 24 24"><circle cx="6" cy="7" r="2.6" /><circle cx="18" cy="7" r="2.6" /><circle cx="12" cy="18" r="2.6" /><path d="M8.2 8.6l2.6 7M15.8 8.6l-2.6 7M8.8 7h6.4" /></svg>
            Groups
          </button>
          <button className={`tab${tab === 'alerts' ? ' on' : ''}`} onClick={() => goTab('/alerts')} aria-current={tab === 'alerts' ? 'page' : undefined}>
            <svg viewBox="0 0 24 24"><path d="M6 17v-6a6 6 0 0112 0v6l1.5 2h-15zM10 21a2 2 0 004 0" /></svg>
            Alerts
            {unread > 0 && <span className="badge" aria-label={`${unread} unread`}>{unread > 9 ? '9+' : unread}</span>}
          </button>
          <button className={`tab wide-only${tab === 'notes' ? ' on' : ''}`} onClick={() => goTab('/notes')} aria-current={tab === 'notes' ? 'page' : undefined}>
            <svg viewBox="0 0 24 24"><path d="M5 4h14v12l-4 4H5zM15 20v-4h4M8 9h8M8 13h5" /></svg>
            Short notes
          </button>
          <button className="tab cam" onClick={startSplit} aria-label="Split a new bill">
            <span className="disc">
              <svg viewBox="0 0 24 24"><path d="M3.5 8h3.2l1.8-2.6h7l1.8 2.6h3.2v11h-17z" /><circle cx="12" cy="13.5" r="3.4" /></svg>
            </span>
            <span className="t">Split</span>
          </button>
          <button className={`tab acct${tab === 'account' ? ' on' : ''}`} onClick={() => goTab('/account')} aria-current={tab === 'account' ? 'page' : undefined}>
            <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></svg>
            Account
          </button>
          <SideLines />
        </nav>
        <SideGrip />
        <div id="footer" className={isFlow ? '' : 'hide'} ref={setFooterEl} />
      </div>
    </FooterCtx.Provider>
  )
}

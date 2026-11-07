import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAppState } from '../data/store'
import { unreadCount } from '../domain/selectors'
import { ChevronIcon } from '../ui/icons'

/**
 * The top-right button of the public pages. Signed out it says "Log in". Signed in it shows the person's name and opens a
 * short menu to jump straight to the app: Groups, Alerts (with how many are new) and Account.
 */
export function AccountLink() {
  const s = useAppState()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('click', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!s.signedIn) return <Link to="/login" className="lp-login">Log in</Link>
  const name = s.profile.name.trim().split(/\s+/)[0] || 'Account'
  const unread = unreadCount(s)
  return (
    <div className="chipw" ref={ref}>
      <button type="button" className="lp-login lp-name" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="lp-name-t">{name}</span> <ChevronIcon />
        {unread > 0 && <span className="lp-dot" aria-label={`${unread} new alerts`} />}
      </button>
      {open && (
        <div className="chipm" role="menu" aria-label="Go to the app" style={{ minWidth: 190 }}>
          <Link to="/groups" role="menuitem" onClick={() => setOpen(false)}>Groups</Link>
          <Link to="/alerts" role="menuitem" onClick={() => setOpen(false)}>
            <span className="grow">Alerts</span>
            {unread > 0 && <span className="pill">{unread} new</span>}
          </Link>
          <Link to="/account" role="menuitem" onClick={() => setOpen(false)}>Account</Link>
        </div>
      )}
    </div>
  )
}

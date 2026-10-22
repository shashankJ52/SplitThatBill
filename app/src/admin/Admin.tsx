import { useCallback, useEffect, useMemo, useState } from 'react'
import { RATINGS } from '../feedback/send'
import { supabase } from '../lib/supabase'
import { Bullet } from '../ui/bits'
import { useTheme } from '../ui/useTheme'
import { feedbackShare, isAdmin, loadAdmin, NOT_ADMIN, setDisabled, since, type AdminClient, type AdminData, type FeedbackRow, type UserRow } from './api'
import './admin.css'

type Stage = 'checking' | 'signin' | 'denied' | 'ready'
const rating = (r: FeedbackRow['rating']) => RATINGS.find((x) => x.value === r) ?? RATINGS[1]
const n = (x: number) => x.toLocaleString('en-US')

/**
 * The private admin page. It signs in with its own form (an admin has no use for the app's groups), asks the database
 * whether this person is an admin, and shows people, activity, receipts scanned and the feedback inbox.
 */
export default function Admin() {
  const client = supabase as (AdminClient & { auth: NonNullable<typeof supabase>['auth'] }) | null
  const { theme, toggle } = useTheme()
  const [stage, setStage] = useState<Stage>(client ? 'checking' : 'signin')
  const [who, setWho] = useState('')
  const [data, setData] = useState<AdminData | null>(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    document.title = 'Admin · SplitThatBill'
    const m = document.createElement('meta')
    m.name = 'robots'
    m.content = 'noindex'
    document.head.appendChild(m)
    return () => m.remove()
  }, [])

  const load = useCallback(async () => {
    if (!client) return
    setLoading(true)
    setErr('')
    try {
      setData(await loadAdmin(client))
      setStage('ready')
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      if (NOT_ADMIN.test(msg)) setStage('denied')
      else setErr('Could not load the numbers. Check your connection and press Refresh.')
    } finally {
      setLoading(false)
    }
  }, [client])

  // someone already signed in on this browser: find out whether they are an admin
  useEffect(() => {
    if (!client) return
    let live = true
    void (async () => {
      const { data: s } = await client.auth.getSession()
      if (!live) return
      if (!s.session) return setStage('signin')
      setWho(s.session.user.email ?? '')
      if (await isAdmin(client)) await load()
      else if (live) setStage('denied')
    })()
    return () => {
      live = false
    }
  }, [client, load])

  const signOut = async () => {
    await client?.auth.signOut()
    setData(null)
    setWho('')
    setStage('signin')
  }

  return (
    <div className="ad">
      <header className="ad-top">
        <Bullet letter="S" color="#FCCC0A" size={34} />
        <b>SplitThatBill admin</b>
        <span className="grow" />
        <button className="ad-icon" onClick={toggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>◐</button>
        {stage === 'ready' && (
          <>
            <button className="ad-btn" onClick={() => void load()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
            <button className="ad-btn" onClick={() => void signOut()}>Sign out</button>
          </>
        )}
      </header>
      <main className="ad-main">
        {stage === 'checking' && <p className="mute">Checking…</p>}
        {(stage === 'signin' || stage === 'denied') && <SignIn client={client} denied={stage === 'denied'} who={who} onSignedIn={async (email) => { setWho(email); if (client && (await isAdmin(client))) await load(); else setStage('denied') }} onSignOut={signOut} />}
        {stage === 'ready' && data && <Dashboard data={data} client={client as AdminClient} onChanged={load} err={err} />}
        {stage === 'ready' && !data && err && <p className="ad-err" role="alert">{err}</p>}
      </main>
    </div>
  )
}

function SignIn({ client, denied, who, onSignedIn, onSignOut }: { client: (AdminClient & { auth: NonNullable<typeof supabase>['auth'] }) | null; denied: boolean; who: string; onSignedIn: (email: string) => Promise<void>; onSignOut: () => Promise<void> }) {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!client) return setErr('The server is not connected in this copy of the app.')
    setBusy(true)
    setErr('')
    const { error } = await client.auth.signInWithPassword({ email: email.trim(), password: pw })
    if (error) {
      setBusy(false)
      return setErr('Wrong email or password.')
    }
    await onSignedIn(email.trim())
    setBusy(false)
  }
  return (
    <form className="ad-card ad-signin" onSubmit={(e) => void submit(e)}>
      <h1>Admin sign in</h1>
      {denied && (
        <div className="ad-err" role="alert">
          {who ? `${who} is not an admin.` : 'This account is not an admin.'}{' '}
          <button type="button" className="linkbtn" onClick={() => void onSignOut()}>Sign out</button> and use the admin account.
        </div>
      )}
      <label className="f" htmlFor="ad-email">Email</label>
      <input id="ad-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
      <label className="f" htmlFor="ad-pw">Password</label>
      <input id="ad-pw" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} />
      {err && <div className="ad-err" role="alert">{err}</div>}
      <div style={{ height: 12 }} />
      <button className="primary" disabled={busy || !email || !pw}>{busy ? 'Signing in…' : 'Sign in'}</button>
    </form>
  )
}

function Stat({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="ad-stat">
      <div className="ad-n">{typeof value === 'number' ? n(value) : value}</div>
      <div className="ad-l">{label}</div>
      {sub && <div className="mute ad-s">{sub}</div>}
    </div>
  )
}

function Dashboard({ data, client, onChanged, err }: { data: AdminData; client: AdminClient; onChanged: () => Promise<void>; err: string }) {
  const o = data.overview
  const share = feedbackShare(o.feedback)
  const [only, setOnly] = useState<'all' | FeedbackRow['rating']>('all')
  const shown = only === 'all' ? data.feedback : data.feedback.filter((f) => f.rating === only)
  return (
    <>
      {err && <p className="ad-err" role="alert">{err}</p>}
      <p className="mute ad-at">As of {new Date(o.at).toLocaleString()}. Numbers are worked out each time you sign in or press Refresh.</p>

      <section className="ad-grid">
        <div className="ad-card">
          <h2>People</h2>
          <div className="ad-stats">
            <Stat label="Total" value={o.users.total} />
            <Stat label="New this week" value={o.users.new7} />
            <Stat label="New this month" value={o.users.new30} />
            <Stat label="Switched off" value={o.users.disabled} />
          </div>
        </div>
        <div className="ad-card">
          <h2>Activity</h2>
          <div className="ad-stats">
            <Stat label="Bills" value={o.bills.total} sub={`${n(o.bills.d7)} this week · ${n(o.bills.d30)} this month`} />
            <Stat label="Payments" value={o.payments.total} sub={`${n(o.payments.d7)} this week · ${n(o.payments.d30)} this month`} />
            <Stat label="Groups" value={o.groups.groups} />
            <Stat label="1-1 splits" value={o.groups.ones} />
          </div>
        </div>
        <div className="ad-card">
          <h2>Receipts scanned</h2>
          <div className="ad-stats">
            <Stat label="All time" value={o.scans.total} />
            <Stat label="Today" value={o.scans.today} />
            <Stat label="Last 7 days" value={o.scans.d7} />
          </div>
        </div>
        <div className="ad-card">
          <h2>Feedback</h2>
          <div className="ad-stats">
            <Stat label="Messages" value={o.feedback.total} />
            {RATINGS.map((r) => (
              <div className="ad-stat" key={r.value}>
                <div className="ad-n"><Bullet letter={r.symbol} color={r.color} size={30} /> {n(o.feedback[r.value])}</div>
                <div className="ad-l">{r.label}</div>
                <div className="mute ad-s">{share[r.value]}%</div>
              </div>
            ))}
          </div>
          <div className="ad-bar" aria-hidden="true">
            {RATINGS.map((r) => <i key={r.value} style={{ width: `${share[r.value]}%`, background: r.color }} />)}
          </div>
        </div>
      </section>

      <section className="ad-card">
        <div className="ad-row">
          <h2>Feedback messages</h2>
          <span className="grow" />
          <div className="ad-chips" role="group" aria-label="Show feedback">
            {([['all', 'All'], ...RATINGS.map((r) => [r.value, r.symbol] as const)] as const).map(([v, label]) => (
              <button key={v} className={only === v ? 'on' : ''} aria-pressed={only === v} onClick={() => setOnly(v as typeof only)}>{label}</button>
            ))}
          </div>
        </div>
        {shown.length === 0 && <p className="mute">{data.feedback.length ? 'None of this kind.' : 'No feedback yet.'}</p>}
        {shown.map((f) => (
          <article className="ad-fb" key={f.id}>
            <Bullet letter={rating(f.rating).symbol} color={rating(f.rating).color} size={38} />
            <div className="grow">
              <div className="ad-msg">{f.message || <span className="mute">(no message)</span>}</div>
              <div className="mute ad-meta">
                {f.user_name ? `${f.user_name} (@${f.user_tag})` : 'Signed out'}
                {f.contact ? ` · ${f.contact}` : f.user_email ? ` · ${f.user_email}` : ''} · {f.page || '/'} · {since(f.created_at)}
              </div>
              <div className="mute ad-dev" title={f.device}>{f.device.replace(/^(installed app|browser) · /, (m) => m.slice(0, -3) + ' · ').slice(0, 120)}</div>
            </div>
          </article>
        ))}
      </section>

      <People users={data.users} client={client} onChanged={onChanged} />
    </>
  )
}

function People({ users, client, onChanged }: { users: UserRow[]; client: AdminClient; onChanged: () => Promise<void> }) {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [ask, setAsk] = useState<string | null>(null)
  const list = useMemo(() => {
    const t = q.trim().toLowerCase()
    return t ? users.filter((u) => `${u.name} ${u.tag} ${u.email}`.toLowerCase().includes(t)) : users
  }, [users, q])
  const flip = async (u: UserRow) => {
    setBusy(u.id)
    setErr('')
    const r = await setDisabled(client, u.id, !u.disabled)
    if (r.err) setErr(r.err)
    else {
      setAsk(null)
      await onChanged()
    }
    setBusy('')
  }
  return (
    <section className="ad-card">
      <div className="ad-row">
        <h2>People ({n(users.length)})</h2>
        <span className="grow" />
        <input className="ad-search" type="search" placeholder="Search name, tag or email" aria-label="Search people" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {err && <p className="ad-err" role="alert">{err}</p>}
      <div className="ad-table" role="table" aria-label="People">
        <div className="ad-th" role="row">
          <span>Person</span><span>Joined</span><span>Last seen</span><span>Groups</span><span>Bills</span><span>Payments</span><span>Scans</span><span />
        </div>
        {list.map((u) => (
          <div className={`ad-tr${u.disabled ? ' off' : ''}`} role="row" key={u.id}>
            <span className="ad-who">
              <b>{u.name}{u.is_admin ? ' · admin' : ''}{u.disabled ? ' · switched off' : ''}</b>
              <span className="mute">@{u.tag} · {u.email}</span>
            </span>
            <span data-l="Joined">{since(u.created_at)}</span>
            <span data-l="Last seen">{since(u.last_sign_in_at)}</span>
            <span data-l="Groups">{n(u.groups)}</span>
            <span data-l="Bills">{n(u.bills)}</span>
            <span data-l="Payments">{n(u.payments)}</span>
            <span data-l="Scans">{n(u.scans)}</span>
            <span className="ad-act">
              {u.is_admin ? null : ask === u.id ? (
                <>
                  <button className="ad-btn danger" disabled={busy === u.id} onClick={() => void flip(u)}>{u.disabled ? 'Switch on' : 'Switch off'}</button>
                  <button className="ad-btn" onClick={() => setAsk(null)}>Cancel</button>
                </>
              ) : (
                <button className="ad-btn" onClick={() => setAsk(u.id)}>Manage</button>
              )}
            </span>
          </div>
        ))}
        {list.length === 0 && <p className="mute" style={{ padding: 12 }}>No one matches.</p>}
      </div>
    </section>
  )
}

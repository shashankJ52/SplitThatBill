import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import * as A from '../data/actions'
import { useAccount } from '../data/account'
import { useAppState, useStore } from '../data/store'
import { FeedbackButton } from '../feedback/FeedbackDialog'
import { AccountLink } from './AccountLink'
import { useInstall } from '../app/install'
import { Bullet } from '../ui/bits'
import { useTheme } from '../ui/useTheme'
import { AssignArt, OweArt, ReceiptArt, ScanArt, SettleArt, ShareArt } from './art'
import './landing.css'
import { ThemeIcon } from '../ui/icons'

const YEAR = new Date().getFullYear()

/** The tagline. One place, so it is easy to change. */
export const TAGLINE = 'The Right Way'

const STOPS: { c: string; l: string; t: string; d: string; art: ReactNode }[] = [
  { c: '#FF6319', l: '1', t: 'Scan the receipt', d: 'Snap a photo or upload one. The items, tax and tip are read for you, and card numbers and names are left out. No receipt? Type the items in.', art: <ScanArt /> },
  { c: '#00933C', l: '2', t: 'Say who had what', d: 'Every line can be split its own way: evenly, in portions, with a friend plus one. The shared nachos and the three beers each get their own answer.', art: <AssignArt /> },
  { c: '#0039A6', l: '3', t: 'See who owes whom', d: 'Balances for each group and for each person, down to the cent. Groups can use their own currency, so a trip abroad stays in euros.', art: <OweArt /> },
  { c: '#FCCC0A', l: '4', t: 'Share it', d: 'Send a WhatsApp message or a link. Anyone can open the link and see the split, with no account needed.', art: <ShareArt /> },
  { c: '#EE352E', l: '5', t: 'Settle up', d: 'Record a payment with a note or a screenshot, and send a friendly reminder. One payment can clear what you owe across several groups at once.', art: <SettleArt /> },
]

const FEATURES = [
  { c: '#FF6319', l: '$', t: 'Item by item', d: 'Split each line of the receipt, not just the total. Tax and tip follow in proportion.' },
  { c: '#00933C', l: 'G', t: 'Groups and just two of you', d: 'Roommates, trips and one-off dinners. Invite friends by tag, and they join once they accept.' },
  { c: '#0039A6', l: '€', t: 'Any currency', d: 'Set a default and give any group its own. Each currency is kept separate and never mixed.' },
  { c: '#B933AD', l: 'P', t: 'Private by design', d: 'Your photo is never stored. It is sent once to an AI to read the items, and card numbers and names are left out.' },
]

/** Fill the line and light up each stop as it scrolls past. Plain scroll math, no libraries. */
function useJourney(scroller: React.RefObject<HTMLElement | null>, journey: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const sc = scroller.current
    const el = journey.current
    if (!sc || !el) return
    const stops = [...el.querySelectorAll<HTMLElement>('.lp-stop')]
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    const update = () => {
      raf = 0
      if (still) {
        el.style.setProperty('--p', '1')
        stops.forEach((s) => s.classList.add('on'))
        return
      }
      const box = el.getBoundingClientRect()
      const mid = window.innerHeight * 0.6
      const p = Math.min(1, Math.max(0, (mid - box.top) / box.height))
      el.style.setProperty('--p', p.toFixed(4))
      stops.forEach((s) => {
        const m = s.querySelector('.lp-marker')?.getBoundingClientRect()
        s.classList.toggle('on', !!m && m.top + m.height / 2 < mid)
      })
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    update()
    sc.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      sc.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [scroller, journey])
}

export default function Landing() {
  const nav = useNavigate()
  const store = useStore()
  const signedIn = useAppState().signedIn
  const account = useAccount()
  const { theme, toggle } = useTheme()
  const { standalone, ios, canPrompt, prompt } = useInstall()
  const scroller = useRef<HTMLDivElement>(null)
  const journey = useRef<HTMLDivElement>(null)
  const installRef = useRef<HTMLElement>(null)
  const [hint, setHint] = useState('')
  useJourney(scroller, journey)

  const demo = async () => {
    // exploring the demo means using sample data that stays on this device
    if (account) await account.enterDemo()
    else if (!store.get().signedIn) store.update(A.signIn)
    nav('/groups', { replace: true })
  }
  const install = async () => {
    if (canPrompt) {
      const r = await prompt()
      if (r === 'dismissed') setHint('No problem. You can install it any time from here.')
      return
    }
    installRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="lp" ref={scroller}>
      <header className="lp-top">
        <Link to="/" className="lp-brand" aria-label="SplitThatBill home">
          <Bullet letter="S" color="#FCCC0A" size={36} />
          <span className="lp-brand-text"><b>SplitThatBill</b><small>{TAGLINE}</small></span>
        </Link>
        <span className="grow" />
        <button className="lp-theme" onClick={toggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}><ThemeIcon /></button>
        <AccountLink />
      </header>

      <main>
        <section className="lp-hero">
          <div className="lp-hero-text">
            <h1>Split that Bill.<br /><span className="lp-accent">{TAGLINE}.</span></h1>
            <p className="lp-lead">Scan a receipt, say who had what, and see who owes whom, item by item. For groups, roommates, trips, or just the two of you.</p>
            <div className="lp-cta">
              {signedIn ? (
                <Link to="/groups" className="lp-btn lp-primary">Open SplitThatBill</Link>
              ) : (
                <Link to="/signup" className="lp-btn lp-primary">Create account</Link>
              )}
            </div>
            <div className="lp-cta2">
              {!signedIn && <button className="lp-link-btn" onClick={() => void demo()}>Try the demo</button>}
              {!standalone && <button className="lp-link-btn" onClick={() => void install()}>Install app</button>}
            </div>
            {hint && <p className="mute" role="status">{hint}</p>}
          </div>
          <ReceiptArt />
        </section>

        <section className="lp-section" aria-labelledby="how">
          <h2 id="how" className="lp-h2">From receipt to settled up in five stops</h2>
          <p className="lp-lead lp-narrow">Every stop is its own line, like a transfer.</p>
          <div className="lp-journey" ref={journey}>
            <div className="lp-track" aria-hidden="true"><i className="lp-fill" /><b className="lp-train"><Bullet letter="S" color="#FCCC0A" size={30} /></b></div>
            {STOPS.map((s) => (
              <article className="lp-stop" key={s.t} style={{ ['--c' as string]: s.c }}>
                <div className="lp-marker"><Bullet letter={s.l} color={s.c} size={44} /></div>
                <div className="lp-stop-body">
                  <div className="lp-stop-text">
                    <h3>{s.t}</h3>
                    <p>{s.d}</p>
                  </div>
                  {s.art}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="lp-section" aria-labelledby="why">
          <h2 id="why" className="lp-h2">Shared nachos, +1 guests, a trip abroad: all handled</h2>
          <div className="lp-grid">
            {FEATURES.map((f) => (
              <div className="lp-card" key={f.t}>
                <Bullet letter={f.l} color={f.c} size={40} />
                <h3>{f.t}</h3>
                <p>{f.d}</p>
              </div>
            ))}
          </div>
        </section>

        {!standalone && (
        <section className="lp-section" id="install" ref={installRef} aria-labelledby="inst">
          <h2 id="inst" className="lp-h2">Put it on your home screen. No app store.</h2>
          <p className="lp-lead lp-narrow">It installs like an app, with its own icon and no browser bar.</p>
          <div className="lp-grid lp-install">
            <div className={`lp-card${ios ? ' lp-here' : ''}`}>
              <h3>iPhone and iPad</h3>
              <ol>
                <li>Open this page in <b>Safari</b>.</li>
                <li>Tap the <b>Share</b> button <span className="lp-share-ico" aria-hidden="true">⬆︎</span> at the bottom.</li>
                <li>Choose <b>Add to Home Screen</b>, then <b>Add</b>.</li>
              </ol>
            </div>
            <div className="lp-card">
              <h3>Android and Chrome</h3>
              <p>Tap <b>Install</b> below, or open the browser menu and choose <b>Install app</b>.</p>
              {!standalone && <button className="lp-btn lp-primary" onClick={() => void install()} disabled={!canPrompt}>{canPrompt ? 'Install app' : 'Use the browser menu'}</button>}
            </div>
            <div className="lp-card">
              <h3>Laptop</h3>
              <p>Just open this site and log in. Your groups and bills are the same on every device.</p>
              <Link to="/login" className="lp-btn lp-secondary">Log in</Link>
            </div>
          </div>
        </section>
        )}

        <section className="lp-final">
          <h2 className="lp-h2 lp-final-h">Next stop: your first split</h2>
          <div className="lp-cta lp-center">
            {signedIn ? (
              <Link to="/groups" className="lp-btn lp-primary">Open SplitThatBill</Link>
            ) : (
              <>
                <Link to="/signup" className="lp-btn lp-primary">Create account</Link>
                <button className="lp-btn lp-secondary" onClick={() => void demo()}>Try the demo</button>
              </>
            )}
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="lp-foot-in">
          <span>© {YEAR} SplitThatBill</span>
          <nav aria-label="Legal">
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
            <FeedbackButton className="lp-foot-btn">Feedback</FeedbackButton>
          </nav>
        </div>
      </footer>
    </div>
  )
}

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { isStandalone } from '../app/install'
import { useAppState } from '../data/store'
import { supabase } from '../lib/supabase'
import { RATINGS, sendFeedback, type Rating } from './send'

/** A link-style button that opens the feedback dialog. Works on every page, signed in or not. */
export function FeedbackButton({ className = 'linkbtn', children = 'Send feedback' }: { className?: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {children}
      </button>
      {open && <FeedbackDialog onClose={() => setOpen(false)} />}
    </>
  )
}

/** "Tell us what you think": three answers (− $ don't like it, $ like it, $ $ $ love it) and a few words. */
function FeedbackDialog({ onClose }: { onClose: () => void }) {
  const signedIn = useAppState().signedIn
  const ref = useRef<HTMLDialogElement>(null)
  const [rating, setRating] = useState<Rating | null>(null)
  const [message, setMessage] = useState('')
  const [contact, setContact] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [sent, setSent] = useState(false)

  useEffect(() => {
    // opened once on mount; it is removed with the component, so it is not closed by hand (that would fire onClose)
    const d = ref.current
    if (d && !d.open) d.showModal()
  }, [])

  const send = async () => {
    setBusy(true)
    setErr('')
    const device = `${isStandalone() ? 'installed app' : 'browser'} · ${navigator.userAgent}`
    const r = await sendFeedback(supabase, { rating, message, contact }, { page: window.location.pathname, device })
    setBusy(false)
    if (r.err) return setErr(r.err)
    setSent(true)
  }

  return (
    <dialog ref={ref} className="fbd" aria-labelledby="fbd-title" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      <div className="fbd-in">
        {sent ? (
          <>
            <h2 id="fbd-title" className="fbd-t">Thank you!</h2>
            <p className="mute">Your feedback was sent. Every message gets read.</p>
            <button className="primary" onClick={onClose}>Close</button>
          </>
        ) : (
          <>
            <h2 id="fbd-title" className="fbd-t">Tell us what you think</h2>
            <p className="mute" style={{ marginTop: 0 }}>Something broken, something missing, or something you like? A few words help a lot.</p>
            <div className="fb-rate" role="radiogroup" aria-label="How do you feel about SplitThatBill?">
              {RATINGS.map((r) => (
                <button key={r.value} type="button" role="radio" aria-checked={rating === r.value} className={`fb-r${rating === r.value ? ' on' : ''}${rating && rating !== r.value ? ' dim' : ''}`} onClick={() => { setRating(r.value); setErr('') }}>
                  <span className="bullet fb-b" style={{ ['--c' as string]: r.color, ['--t' as string]: r.ink, ['--s' as string]: '56px', fontSize: r.size }}>{r.symbol}</span>
                  <span>{r.label}</span>
                </button>
              ))}
            </div>
            <label className="f" htmlFor="fb-msg">Your thoughts (optional)</label>
            <textarea id="fb-msg" rows={4} maxLength={2000} placeholder="What could be better? What do you like?" value={message} onChange={(e) => setMessage(e.target.value)} />
            {signedIn ? (
              <p className="mute" style={{ fontSize: 12 }}>Sent with your account name, so we can follow up if needed.</p>
            ) : (
              <>
                <label className="f" htmlFor="fb-contact">Email, if you would like a reply (optional)</label>
                <input id="fb-contact" type="email" autoComplete="email" maxLength={200} placeholder="you@example.com" value={contact} onChange={(e) => { setContact(e.target.value); setErr('') }} />
              </>
            )}
            {err && <div className="bar bad" role="alert" style={{ marginTop: 10 }}>{err}</div>}
            <div style={{ height: 12 }} />
            <button className="primary" disabled={busy || !rating} onClick={() => void send()}>{busy ? 'Sending…' : 'Send feedback'}</button>
            <div style={{ height: 8 }} />
            <button className="secondary" onClick={onClose}>Cancel</button>
          </>
        )}
      </div>
    </dialog>
  )
}

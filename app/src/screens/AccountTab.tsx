import { useEffect, useState, type ReactNode } from 'react'
import { Screen } from '../app/Screen'
import * as A from '../data/actions'
import { useAccount, useAccountMode } from '../data/account'
import { useAppState, useSaveStatus, useStore } from '../data/store'
import { defaultCurrency, paperSize } from '../domain/selectors'
import { ME } from '../domain/types'
import { CurrencyPicker } from '../ui/CurrencyPicker'
import { FeedbackButton } from '../feedback/FeedbackDialog'
import { DeleteAccountSheet } from '../sheets/DeleteAccountSheet'
import { ProfileSheet, profileTitle, type ProfileField } from '../sheets/ProfileSheet'
import { Bullet, Seg } from '../ui/bits'
import { useSheet } from '../ui/Sheet'
import { useToast } from '../ui/Toast'
import { shareMyTag } from '../ui/shareTag'
import { resetUiState, useUiState } from '../ui/uiState'
import { useTheme } from '../ui/useTheme'
import { uid } from '../domain/util'
import { useNavigate } from 'react-router-dom'

export function AccountTab() {
  const s = useAppState()
  const store = useStore()
  const sheet = useSheet()
  const toast = useToast()
  const nav = useNavigate()
  const account = useAccount()
  const live = useAccountMode() === 'cloud'
  const saveStatus = useSaveStatus()
  const { theme, toggle } = useTheme()
  // one section open at a time, remembered while you move around the app
  const [unfolded, setUnfolded] = useUiState<string | null>('account.open', null)
  const toggleFold = (id: string) => setUnfolded(unfolded === id ? null : id)
  const p = s.profile

  const edit = (f: ProfileField) => {
    if (live && f === 'email') return toast("Changing your email isn't available yet")
    open(f)
  }
  const open = (f: ProfileField) => sheet.open(profileTitle(f), (close) => <ProfileSheet field={f} close={close} />)
  const share = () => shareMyTag(p.tag, toast)
  const logout = () =>
    sheet.open('Log out?', (close) => (
      <>
        <p className="mute">You'll need to sign in again to see your groups.</p>
        <button
          className="primary"
          onClick={async () => {
            close()
            if (account) await account.signOut()
            else store.update(A.signOut)
            resetUiState()
            nav('/welcome', { replace: true, state: { anim: 'back' } })
            toast('Logged out')
          }}
        >
          Log out
        </button>
        <div style={{ height: 10 }} />
        <button className="secondary" onClick={close}>Cancel</button>
      </>
    ))
  const confirmClear = () =>
    sheet.open('Clear all data?', (close) => (
      <>
        <p className="mute">Removes every group, split, alert and note on this device. Your account stays.</p>
        <button className="primary" style={{ background: 'var(--red)', borderColor: 'var(--red)', color: '#fff' }} onClick={() => { store.update(A.clearAllData); resetUiState(); close(); toast('All data cleared') }}>Clear everything</button>
        <div style={{ height: 10 }} />
        <button className="secondary" onClick={close}>Keep my data</button>
      </>
    ))
  const friendBill = () => {
    const r = A.demoFriendAddsBill(store.get(), { bill: uid('b'), notif: uid('n') }, new Date().toISOString().slice(0, 10), Date.now())
    if (!r.ok) return toast('Needs a group with James and you in it')
    store.update(() => r.state)
    toast('New split from James')
  }
  const friendRemind = () => {
    const r = A.demoFriendReminder(store.get(), uid('n'), Date.now())
    if (!r.from) return toast('Needs a group where you owe a friend on the app')
    store.update(() => r.state)
    toast(`Reminder from ${s.people[r.from]?.name ?? 'a friend'}`)
  }

  const rows: [ProfileField, string, string][] = [
    ['name', 'Name', p.name],
    ['email', 'Email', p.email],
    ['tag', 'User tag', `@${p.tag}`],
    ['pw', 'Password', '••••••••'],
  ]
  return (
    <Screen id="v-account">
      <div className="vhead"><h1 className="display">Account</h1></div>
      <div className="vbody">
        <div className="sign row">
          <Bullet letter={p.name.charAt(0).toUpperCase() || '?'} color="#B933AD" size={56} />
          <div className="grow">
            <div className="gname">{p.name}</div>
            <div style={{ color: '#bdbdbd' }}>@{p.tag}</div>
          </div>
        </div>
        <div style={{ height: 14 }} />
        <Fold id="profile" title="Profile" summary={`@${p.tag}`} open={unfolded === 'profile'} onToggle={toggleFold}>
          {rows.map(([f, label, val]) => (
            <div className="card tap row" key={f} role="button" tabIndex={0} onClick={() => edit(f)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), edit(f))}>
              <div className="grow"><div className="mute">{label}:</div><b>{val}</b></div>
              <span className="mute">Edit ›</span>
            </div>
          ))}
        </Fold>
        <Fold id="currency" title="Currency" summary={defaultCurrency(s)} open={unfolded === 'currency'} onToggle={toggleFold}>
          <CurrencyPicker label="Default currency" value={defaultCurrency(s)} onChange={(code) => { store.update((x) => A.setDefaultCurrency(x, code)); toast(`New groups and splits will use ${code}`) }} />
          <p className="mute">
            Used for new groups and 1-1 splits, and for the totals on the Groups tab. Each group can have its own currency in its settings, for example euros for a trip. Amounts are never converted.
          </p>
        </Fold>
        <Fold id="appearance" title="Appearance" summary={`${theme === 'dark' ? 'Dark' : 'Light'} · ${paperSize(s)}`} open={unfolded === 'appearance'} onToggle={toggleFold}>
          <button className="secondary" onClick={toggle}>Switch light / dark</button>
          <label className="f">Paper size for PDFs</label>
          <Seg<'Letter' | 'A4'> label="Paper size for PDFs" value={paperSize(s)} onChange={(p) => store.update((x) => A.setPaperSize(x, p))} options={[{ value: 'Letter', label: 'Letter' }, { value: 'A4', label: 'A4' }]} />
          <p className="mute">Used when you save a bill as a PDF.</p>
        </Fold>
        <Fold id="invite" title="Invite friends" summary={`@${p.tag}`} open={unfolded === 'invite'} onToggle={toggleFold}>
          <button className="primary" onClick={share}>Share my tag @{p.tag}</button>
          <p className="mute">Friends can add you by your tag. Share the app link at the same time.</p>
        </Fold>
        {!live && (
          <Fold id="demo" title="Demo tools" summary="Sample data" open={unfolded === 'demo'} onToggle={toggleFold}>
            <div className="btnrow">
              <button className="secondary" onClick={() => { store.update((x) => A.reloadSample(x, Date.now())); resetUiState(); toast('Sample data reloaded') }}>Reload sample data</button>
              <button className="secondary" onClick={confirmClear}>Clear all data</button>
            </div>
            <button className="secondary" style={{ marginBottom: 10 }} onClick={friendBill}>Demo: friend adds a bill</button>
            <button className="secondary" style={{ marginBottom: 10 }} onClick={friendRemind}>Demo: friend sends me a reminder</button>
          </Fold>
        )}
        <div style={{ height: 6 }} />
        <button className="secondary danger" onClick={logout}>Log out</button>
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <button className="linkbtn" onClick={() => nav('/home')}>About SplitThatBill</button>
        </div>
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <FeedbackButton>Send feedback</FeedbackButton>
        </div>
        {live && (
          <div style={{ textAlign: 'center', marginTop: 12 }}>
            <button className="linkbtn" onClick={() => sheet.open('Delete your account?', (close) => <DeleteAccountSheet close={close} />)}>Delete my account</button>
          </div>
        )}
        <p className="mute" style={{ fontSize: 12 }}>
          {live
            ? `Signed in as ${p.email}. ${saveStatus === 'saving' ? 'Saving…' : saveStatus === 'error' ? "Couldn't save. Will retry when you're back online." : 'All changes saved to your account.'}`
            : account
              ? 'Demo mode: sample data kept on this device only. Log out and create an account to save your own.'
              : `Signed in as ${s.people[ME]?.tag ? `@${s.people[ME].tag}` : p.email}. Data is kept on this device.`}
        </p>
      </div>
    </Screen>
  )
}

/** A section that opens downward when its header is tapped, showing a short summary while it is closed. */
function Fold({ id, title, summary, open, onToggle, children }: { id: string; title: string; summary: string; open: boolean; onToggle: (id: string) => void; children: ReactNode }) {
  // content is clipped while the section slides open or shut, then freed so a menu inside can stick out
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setSettled(open), open ? 320 : 0)
    return () => clearTimeout(t)
  }, [open])
  return (
    <section className="fold">
      <button type="button" className="fold-h" aria-expanded={open} aria-controls={`fold-${id}`} onClick={() => onToggle(id)}>
        <span className="fold-t">{title}</span>
        <span className="fold-s mute">{summary}</span>
        <span className="chev" aria-hidden="true">⌄</span>
      </button>
      <div className={`fold-b${open ? ' open' : ''}${open && settled ? ' settled' : ''}`} id={`fold-${id}`} inert={!open}>
        <div className="fold-i">{children}</div>
      </div>
    </section>
  )
}

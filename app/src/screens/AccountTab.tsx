import { Screen } from '../app/Screen'
import * as A from '../data/actions'
import { useAccount, useAccountMode } from '../data/account'
import { useAppState, useSaveStatus, useStore } from '../data/store'
import { defaultCurrency } from '../domain/selectors'
import { ME } from '../domain/types'
import { CurrencyPicker } from '../ui/CurrencyPicker'
import { ProfileSheet, profileTitle, type ProfileField } from '../sheets/ProfileSheet'
import { Bullet } from '../ui/bits'
import { useSheet } from '../ui/Sheet'
import { useToast } from '../ui/Toast'
import { resetUiState } from '../ui/uiState'
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
  const { toggle } = useTheme()
  const p = s.profile

  const edit = (f: ProfileField) => {
    if (live && f === 'email') return toast("Changing your email isn't available yet")
    open(f)
  }
  const open = (f: ProfileField) => sheet.open(profileTitle(f), (close) => <ProfileSheet field={f} close={close} />)
  const share = async () => {
    const t = `Add me on SplitThatBill: @${p.tag} ${window.location.origin}/u/${p.tag}`
    try {
      if (navigator.share) return void (await navigator.share({ text: t }).catch(() => undefined))
      await navigator.clipboard.writeText(t)
      toast('Invite copied')
    } catch {
      toast('Copy blocked. Share your tag manually.')
    }
  }
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
        <h2>Profile</h2>
        {rows.map(([f, label, val]) => (
          <div className="card tap row" key={f} role="button" tabIndex={0} onClick={() => edit(f)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), edit(f))}>
            <div className="grow"><div className="mute">{label}:</div><b>{val}</b></div>
            <span className="mute">Edit ›</span>
          </div>
        ))}
        <h2>Currency</h2>
        <CurrencyPicker label="Default currency" value={defaultCurrency(s)} onChange={(code) => { store.update((x) => A.setDefaultCurrency(x, code)); toast(`New groups and splits will use ${code}`) }} />
        <p className="mute">
          Used for new groups and 1-1 splits, and for the totals on the Groups tab. Each group can have its own currency in its settings, for example euros for a trip. Amounts are never converted.
        </p>
        <h2>Invite friends</h2>
        <button className="primary" onClick={share}>Share my tag @{p.tag}</button>
        <p className="mute">Friends can add you by your tag. Share the app link at the same time.</p>
        <h2>Appearance</h2>
        <button className="secondary" onClick={toggle}>Switch light / dark</button>
        {!live && <h2>Demo tools</h2>}
        {!live && (
          <>
        <div className="btnrow">
          <button className="secondary" onClick={() => { store.update((x) => A.reloadSample(x, Date.now())); resetUiState(); toast('Sample data reloaded') }}>Reload sample data</button>
          <button className="secondary" onClick={confirmClear}>Clear all data</button>
        </div>
        <button className="secondary" style={{ marginBottom: 10 }} onClick={friendBill}>Demo: friend adds a bill</button>
        <button className="secondary" style={{ marginBottom: 10 }} onClick={friendRemind}>Demo: friend sends me a reminder</button>
          </>
        )}
        <button className="secondary danger" onClick={logout}>Log out</button>
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

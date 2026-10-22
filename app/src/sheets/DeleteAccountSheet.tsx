import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as A from '../data/actions'
import { useAccount } from '../data/account'
import { useAppState, useStore } from '../data/store'
import { deletionPlan, writeOffPayments } from '../domain/membership'
import { currencyOf, ledgerName, personName } from '../domain/selectors'
import { ME } from '../domain/types'
import { fmt, today, uid } from '../domain/util'
import { Avatar } from '../ui/bits'
import { Dropdown, type Option } from '../ui/Dropdown'
import { PwField } from '../screens/auth/parts'
import { useToast } from '../ui/Toast'

const DELETE_WORD = 'DELETE'

/**
 * Delete the signed-in account for good. It explains what happens to every group, asks who takes over the groups you
 * run, writes off what is unsettled so nobody else's balance changes, and only then asks for the password.
 */
export function DeleteAccountSheet({ close }: { close: () => void }) {
  const s = useAppState()
  const store = useStore()
  const account = useAccount()
  const nav = useNavigate()
  const toast = useToast()
  const plan = useMemo(() => deletionPlan(s), [s])
  // for each group you run: the person who takes it over, or "delete" to remove it for everyone
  const [choice, setChoice] = useState<Record<string, string>>({})
  const pick = (gid: string, fallback: string) => choice[gid] ?? fallback
  const [ack, setAck] = useState(false)
  const [pw, setPw] = useState('')
  const [word, setWord] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  // groups that carry on after you are gone are the ones whose balances get written off
  const kept = plan.balances.filter((b) => {
    const h = plan.handover.find((x) => x.ledger.id === b.ledger.id)
    return !h || pick(h.ledger.id, h.candidates[0]) !== 'delete'
  })
  const ready = word === DELETE_WORD && pw.length > 0 && (kept.length === 0 || ack) && !busy

  const go = async () => {
    if (!account || !ready) return
    setBusy(true)
    setErr('')
    try {
      // check the password before anything that cannot be undone
      const ok = await account.checkPassword(pw)
      if (ok.err) return setErr(ok.err)
      const name = s.profile.name || 'A member'
      // 1. write off what is unsettled, so nobody else's balance changes
      if (kept.length) {
        store.update((st) => {
          let state = st
          for (const b of kept) {
            const l = state.ledgers.find((x) => x.id === b.ledger.id)
            if (!l) continue
            for (const p of writeOffPayments(l, ME, () => uid('p'), today(), `Written off when ${name} deleted their account`)) state = A.addPayment(state, l.id, p)
          }
          return state
        })
        await store.flush()
      }
      // 2. hand each group to its new owner, or delete it when that was chosen
      for (const h of plan.handover) {
        const c = pick(h.ledger.id, h.candidates[0])
        if (c === 'delete') {
          store.update((st) => A.deleteGroup(st, h.ledger.id))
          await store.flush()
        } else {
          const r = await account.transferOwnership(h.ledger.id, c)
          if (r.err) return setErr(`${r.err}. Nothing was deleted. Try again.`)
        }
      }
      // 3. the account itself
      const r = await account.deleteAccount(pw)
      if (r.err) return setErr(`${r.err}. Some steps above may already be done. Open Delete account again to continue.`)
      close()
      nav('/', { replace: true })
      toast('Your account was deleted')
    } finally {
      setBusy(false)
    }
  }

  const options = (h: (typeof plan.handover)[number]): Option<string>[] => [
    ...h.candidates.map((p) => ({ value: p, label: `Hand over to ${personName(s, p)}`, icon: <Avatar pid={p} size={28} /> })),
    { value: 'delete', label: 'Delete it for everyone', icon: <span className="bullet" style={{ ['--c' as string]: '#EE352E', ['--t' as string]: '#fff', ['--s' as string]: '28px' }}>✕</span> },
  ]

  return (
    <>
      <p className="mute">This deletes your account for good and cannot be undone. Here is what happens.</p>

      {plan.handover.length > 0 && (
        <>
          <label className="f">Groups you run</label>
          <div className="mute" style={{ marginBottom: 6 }}>Other people still use these, so each needs a new owner. Nothing is lost for them.</div>
          {plan.handover.map((h) => (
            <div key={h.ledger.id} style={{ marginBottom: 10 }}>
              <b>{ledgerName(s, h.ledger)}</b>
              <Dropdown label={`What happens to ${ledgerName(s, h.ledger)}`} value={pick(h.ledger.id, h.candidates[0])} onChange={(v) => setChoice({ ...choice, [h.ledger.id]: v })} options={options(h)} />
            </div>
          ))}
        </>
      )}

      {plan.leaving.length > 0 && (
        <>
          <label className="f">Groups you leave</label>
          <div className="mute">{plan.leaving.map((l) => ledgerName(s, l)).join(', ')}. Your name stays on the old bills so everyone's history still makes sense.</div>
        </>
      )}

      {plan.removed.length > 0 && (
        <>
          <label className="f">Removed with your account</label>
          <div className="mute">{plan.removed.map((l) => ledgerName(s, l)).join(', ')}. Nobody else with an account is in {plan.removed.length === 1 ? 'it' : 'them'}.</div>
        </>
      )}

      {kept.length > 0 && (
        <>
          <label className="f">Unsettled balances</label>
          <div className="card lines" style={{ display: 'block' }}>
            {kept.map((b) => (
              <div key={b.ledger.id}>
                <span>{ledgerName(s, b.ledger)}</span>
                <span style={{ color: `var(--${b.net > 0 ? 'green-t' : 'red-t'})` }}>{b.net > 0 ? 'you are owed ' : 'you owe '}{fmt(Math.abs(b.net), currencyOf(s, b.ledger))}</span>
              </div>
            ))}
          </div>
          <label className="switch" style={{ margin: '10px 0' }}>
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            <span>
              <b>Write these off</b>
              <div className="mute">They are cleared with a visible adjustment so nobody else's balance changes. Settle up first if you would rather.</div>
            </span>
          </label>
        </>
      )}

      <label className="f">Also deleted</label>
      <div className="mute">Your notes, lists, alerts and settings.</div>

      <label className="f" htmlFor="del-word">Type {DELETE_WORD} to confirm</label>
      <input id="del-word" autoCapitalize="characters" autoComplete="off" value={word} onChange={(e) => { setWord(e.target.value); setErr('') }} placeholder={DELETE_WORD} />
      <PwField id="del-pw" label="Your password" auto="current-password" value={pw} onChange={(v) => { setPw(v); setErr('') }} />
      {err && <div className="bar bad" role="alert" style={{ marginTop: 10 }}>{err}</div>}
      <div style={{ height: 12 }} />
      <button className="primary" style={{ background: 'var(--red)', borderColor: 'var(--red)', color: '#fff' }} disabled={!ready} onClick={() => void go()}>{busy ? 'Deleting…' : 'Delete my account'}</button>
      <div style={{ height: 10 }} />
      <button className="secondary" disabled={busy} onClick={close}>Keep my account</button>
    </>
  )
}

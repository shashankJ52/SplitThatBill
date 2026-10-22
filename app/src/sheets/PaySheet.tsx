import { useState } from 'react'
import * as A from '../data/actions'
import { useAppState, useStore } from '../data/store'
import { currencyOf, defaultCurrency, ledgerById, ledgerName, pairBalance, payableCurrencies, personName } from '../domain/selectors'
import { CurrencyPicker } from '../ui/CurrencyPicker'
import { ME } from '../domain/types'
import { fmt as fmtIn, parseMoney, today, uid } from '../domain/util'
import { transfers } from '../money'
import { Avatar } from '../ui/bits'
import { Dropdown, type Option } from '../ui/Dropdown'
import { useToast } from '../ui/Toast'

const MAX_IMAGE = 3 * 1024 * 1024

/** Record a payment inside a group (who paid whom) or with one person (spread over everything you share). */
export function PaySheet({ gid, pid, close }: { gid?: string; pid?: string; close: () => void }) {
  const s = useAppState()
  const store = useStore()
  const toast = useToast()
  const g = gid ? ledgerById(s, gid) : undefined

  const suggestion = g ? (() => {
    const tr = transfers(g)
    return tr.find((t) => t.from === ME || t.to === ME) ?? tr[0]
  })() : undefined
  const currencies = pid ? payableCurrencies(s, pid) : []
  const [cur, setCur] = useState(g ? currencyOf(s, g) : currencies.includes(defaultCurrency(s)) ? defaultCurrency(s) : (currencies[0] ?? defaultCurrency(s)))
  const fmt = (c: number) => fmtIn(c, cur)
  const tot = pid ? pairBalance(s, pid, cur).tot : 0

  const [from, setFrom] = useState(suggestion?.from ?? ME)
  const [to, setTo] = useState(suggestion?.to ?? (g?.members[1] ?? ME))
  const [dir, setDir] = useState<'out' | 'in'>(tot < 0 ? 'out' : 'in')
  const [amt, setAmt] = useState(pid ? (tot ? (Math.abs(tot) / 100).toFixed(2) : '') : suggestion ? (suggestion.amt / 100).toFixed(2) : '')
  const [note, setNote] = useState('')
  const [img, setImg] = useState<string | null>(null)
  const [err, setErr] = useState('')

  const people: Option<string>[] = (g?.members ?? []).map((m) => ({ value: m, label: personName(s, m), sub: s.people[m]?.user ? '' : '· local', icon: <Avatar pid={m} size={28} /> }))
  const cents = parseMoney(amt)
  const plan = pid && cents && cents > 0 ? A.planPersonPayment(s, pid, dir, cents, cur).plan : null
  const pickCurrency = (code: string) => {
    // the balance, and so the suggested direction and amount, differ per currency
    const t = pid ? pairBalance(s, pid, code).tot : 0
    setCur(code)
    setDir(t < 0 ? 'out' : 'in')
    setAmt(t ? (Math.abs(t) / 100).toFixed(2) : '')
  }

  const onFile = (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) return setErr('Please choose an image file')
    if (file.size > MAX_IMAGE) return setErr('That image is over 3 MB')
    const r = new FileReader()
    r.onload = () => { setImg(String(r.result)); setErr('') }
    r.onerror = () => setErr('Could not read that image')
    r.readAsDataURL(file)
  }

  const save = () => {
    if (cents === null || cents <= 0) return setErr('Enter an amount like 12.50')
    const id = uid('p')
    if (g) {
      if (from === to) return setErr('Pick two different people')
      store.update((st) => A.addPayment(st, g.id, { id, linkId: id, from, to, amt: cents, date: today(), note: note.trim(), img, ts: Date.now() }))
      toast('Payment recorded')
    } else if (pid) {
      let text = ''
      store.update((st) => {
        const r = A.applyPersonPayment(st, { id, newLedgerId: uid('o'), pid, direction: dir, amt: cents, date: today(), note: note.trim(), img, ts: Date.now(), currency: cur })
        text = r.steps.map((x) => `${ledgerName(r.state, ledgerById(r.state, x.ledgerId) as never)} ${fmt(x.amt)}`).join(', ')
        return r.state
      })
      toast(`Recorded: ${text}`)
    }
    close()
  }

  return (
    <>
      {g ? (
        <>
          <label className="f">Who paid</label>
          <Dropdown label="Who paid" value={from} options={people} onChange={setFrom} />
          <label className="f">Paid to</label>
          <Dropdown label="Paid to" value={to} options={people} onChange={setTo} />
        </>
      ) : (
        <>
          <label className="f">Direction</label>
          <Dropdown
            label="Direction" value={dir} onChange={setDir}
            options={[
              { value: 'out', label: `I paid ${personName(s, pid as string)}`, icon: <Avatar pid={ME} size={28} /> },
              { value: 'in', label: `${personName(s, pid as string)} paid me`, icon: <Avatar pid={pid as string} size={28} /> },
            ]}
          />
        </>
      )}
      {pid && currencies.length > 1 && (
        <>
          <label className="f">Currency</label>
          <CurrencyPicker value={cur} onChange={pickCurrency} codes={currencies} />
        </>
      )}
      <label className="f" htmlFor="pa">Amount</label>
      <input id="pa" inputMode="decimal" placeholder="0.00" value={amt} className={err.includes('amount') ? 'bad' : ''} onChange={(e) => { setAmt(e.target.value); setErr('') }} />
      {plan && <div className="mute" style={{ marginTop: 8 }}>Applies to: {plan.steps.map((x) => `${x.ledger ? ledgerName(s, x.ledger as never) : '1-1 with new ledger'} ${fmt(x.amt)}`).join(', ')}</div>}
      <label className="f" htmlFor="pnote">Note (optional)</label>
      <textarea id="pnote" rows={2} maxLength={200} placeholder="e.g. Zelle, ref 4821" value={note} onChange={(e) => setNote(e.target.value)} />
      <label className="f">Proof (optional)</label>
      {img && (
        <div className="row">
          <img className="thumb" src={img} alt="Attached proof" />
          <div className="grow mute">Attached</div>
          <button className="del" aria-label="Remove image" onClick={() => setImg(null)}>✕</button>
        </div>
      )}
      <label className="secondary" style={{ display: 'block', textAlign: 'center', padding: 12, border: '2px solid var(--fg)', borderRadius: 999, fontWeight: 700, cursor: 'pointer', marginTop: 6 }}>
        Attach a screenshot or photo
        <input type="file" accept="image/*" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = '' }} />
      </label>
      {err && <div className="bar bad" role="alert" style={{ marginTop: 10 }}>{err}</div>}
      <div style={{ height: 10 }} />
      <button className="primary" onClick={save}>Save payment</button>
    </>
  )
}

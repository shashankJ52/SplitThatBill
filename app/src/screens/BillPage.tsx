import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { Screen } from '../app/Screen'
import * as A from '../data/actions'
import { useAppState, useStore } from '../data/store'
import { billLink, whatsappText } from '../domain/share'
import { currencyOf, findBill, ledgerName, personName } from '../domain/selectors'
import { buildExportModel } from '../share/exportModel'
import { ShareImageSheet } from '../sheets/ShareImageSheet'
import { ME } from '../domain/types'
import { ago, uid, whenLabel } from '../domain/util'
import { useMoney } from '../ui/useMoney'
import { BillBreakdown, receiptNote } from '../ui/BillBreakdown'
import { paidText } from '../ui/BillCards'
import { useFlow } from '../flow/FlowProvider'
import { useSheet } from '../ui/Sheet'
import { useToast } from '../ui/Toast'

export function BillPage() {
  const { id = '' } = useParams()
  const s = useAppState()
  const store = useStore()
  const nav = useNavigate()
  const sheet = useSheet()
  const flow = useFlow()
  const toast = useToast()
  const [comment, setComment] = useState('')
  const [bad, setBad] = useState(false)
  const f = findBill(s, id)
  const fmt = useMoney(f?.ledger)
  if (!f) return <Navigate to="/groups" replace />
  const { bill: b, ledger: L } = f
  const mine = b.by === ME
  const rn = receiptNote(b, fmt)

  const post = () => {
    const t = comment.trim()
    if (!t) {
      setBad(true)
      return toast('Write a comment first')
    }
    store.update((st) => A.addComment(st, b.id, { id: uid('c'), by: ME, text: t, ts: Date.now() }))
    setComment('')
    toast('Comment posted')
  }
  const remove = () =>
    sheet.open('Delete this bill?', (close) => (
      <>
        <p className="mute">It disappears for everyone in the split and balances update. This can't be undone.</p>
        <button className="primary" style={{ background: 'var(--red)', borderColor: 'var(--red)', color: '#fff' }} onClick={() => { store.update((st) => A.deleteBill(st, b.id)); close(); toast('Bill deleted'); nav(-1) }}>Delete bill</button>
        <div style={{ height: 10 }} />
        <button className="secondary" onClick={close}>Keep it</button>
      </>
    ))
  const share = () => sheet.open('Share this bill', (close) => <ShareSheet billId={b.id} close={close} />)

  return (
    <Screen id="v-bill">
      <div className="vhead">
        <div className="gname" style={{ fontSize: 30, lineHeight: 1.05, marginTop: 4 }}>{b.title}</div>
        <div className="mute">{b.date}{b.loc ? ` · 📍 ${b.loc}` : ''}</div>
        <div className="mute">{paidText(s, b)} · added by {personName(s, b.by)}{b.ts ? ` · ${whenLabel(b.ts, b.date, { exact: true })}` : ''}</div>
        <div className="row" style={{ margin: '8px 0', flexWrap: 'wrap', gap: 8 }}>
          <Link className="pill tap" to={L.kind === 'group' ? `/groups/${L.id}` : `/person/${L.with}`}>{ledgerName(s, L)} ›</Link>
          <span className="pill">{b.cat || 'Other'}</span>
        </div>
        <div className="sign" style={{ marginBottom: 6 }}>
          <div className="row">
            <div className="grow"><div className="lbl">Total</div><div className="num" style={{ fontSize: 30 }}>{fmt(b.total)}</div></div>
            {b.shares[ME] ? <div style={{ textAlign: 'right' }}><div className="lbl" style={{ justifyContent: 'flex-end' }}>Your share</div><div className="num" style={{ fontSize: 22 }}>{fmt(b.shares[ME])}</div></div> : null}
          </div>
          {rn && <div className="mute">{rn}</div>}
        </div>
      </div>
      <div className="vbody">
        {b.notes && <div className="card" style={{ display: 'block' }}><div className="mute">Notes</div>{b.notes}</div>}
        <BillBreakdown bill={b} ledger={L} />
        <h2>Share</h2>
        <button className="secondary" onClick={share}>Share link to this bill</button>
        <div style={{ height: 10 }} />
        <button
          className="secondary"
          onClick={() => {
            const m = buildExportModel(s, b, { groupName: L.kind === 'group' ? (L.name ?? null) : null, currency: currencyOf(s, L), link: b.token ? billLink(window.location.origin, b.token) : null })
            sheet.open('Share as a picture', (close) => <ShareImageSheet model={m} linkWorks close={close} />)
          }}
        >
          Share as a picture
        </button>
        <h2>Manage</h2>
        {mine ? (
          <div className="btnrow">
            <button className="primary" onClick={() => { flow.edit(b, L); nav('/scan/review') }}>Edit bill</button>
            <button className="secondary danger" onClick={remove}>Delete</button>
          </div>
        ) : (
          <div className="bar info">Added by {personName(s, b.by)}. Only they can edit or delete this bill. Leave a comment below to ask for a change.</div>
        )}
        <h2>Comments</h2>
        {b.comments.length ? b.comments.map((c) => (
          <div className={`cmt${c.sys ? ' sys' : ''}`} key={c.id}>
            <div className="row">
              <div className="grow">{!c.sys && <b>{personName(s, c.by)} </b>}<span className="mute">{ago(c.ts)}</span></div>
              {!c.sys && c.by === ME && <button className="del" aria-label="Delete comment" onClick={() => store.update((st) => A.deleteComment(st, b.id, c.id))}>✕</button>}
            </div>
            {c.sys ? c.text : <div>{c.text}</div>}
          </div>
        )) : <div className="empty sm"><b>No comments yet</b>Ask a question or flag a mistake.</div>}
        <label className="f" htmlFor="cm-text">Add a comment</label>
        <textarea id="cm-text" rows={2} maxLength={300} className={bad ? 'bad' : ''} placeholder="e.g. I didn't have the nachos" value={comment} onChange={(e) => { setComment(e.target.value); setBad(false) }} />
        <div style={{ height: 10 }} />
        <button className="primary" onClick={post}>Post comment</button>
      </div>
    </Screen>
  )
}

function ShareSheet({ billId, close }: { billId: string; close: () => void }) {
  const s = useAppState()
  const nav = useNavigate()
  const toast = useToast()
  const f = findBill(s, billId)
  if (!f) return null
  const link = billLink(window.location.origin, f.bill.token)
  const copy = async (text: string, ok: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast(ok)
    } catch {
      toast('Copy blocked. Select the text manually.')
    }
  }
  return (
    <>
      <label className="f">Link</label>
      <div className="linkbox">
        <input readOnly value={link} aria-label="Bill link" />
        <button className="secondary" onClick={() => copy(link, 'Link copied')}>Copy</button>
      </div>
      <p className="mute">Opens without the app. Shows only this bill, how it's split and notes. No balances, groups or account details.</p>
      <button className="primary" onClick={() => { close(); nav(`/preview/${f.bill.id}`) }}>Preview what friends see</button>
      <div style={{ height: 10 }} />
      <button className="secondary" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(whatsappText(s, f.bill, f.ledger.kind === 'group' ? (f.ledger.name ?? null) : null, link))}`, '_blank', 'noopener')}>Send on WhatsApp</button>
    </>
  )
}


import { useNavigate } from 'react-router-dom'
import { useDraftMoney } from '../../flow/useDraftMoney'
import { Screen } from '../../app/Screen'
import { useAppState } from '../../data/store'
import { CATEGORIES } from '../../domain/bills'
import * as D from '../../domain/draft'
import { groupGlyph, ledgerById, personName } from '../../domain/selectors'
import { useFlow } from '../../flow/FlowProvider'
import { withDraft } from '../../flow/withDraft'
import { Avatar, Bullet } from '../../ui/bits'
import { Dropdown } from '../../ui/Dropdown'
import { FlowFooter } from '../../ui/FlowFooter'
import { PERSONAL_COLOR } from '../../data/actions'
import { useSave } from '../../flow/useSave'
import { MoneyField } from '../../ui/MoneyField'

export const Details = withDraft(function Details({ d }: { d: D.Draft }) {
  const fmt = useDraftMoney(d)
  const { set } = useFlow()
  const nav = useNavigate()
  const save = useSave()
  const s = useAppState()
  const g = d.kind === 'group' && d.gid ? ledgerById(s, d.gid) : null
  const total = D.grandTotal(d)
  const left = total - D.paidSum(d)
  const payerValue = d.multi ? '__multi' : d.payer

  return (
    <Screen id="v-details">
      <div className="vhead"><h1 className="display">Details</h1></div>
      <div className="vbody">
        <label className="f" style={{ marginTop: 0 }}>{d.personal ? 'Saved to' : 'Split with'}</label>
        <div className="card">
          {d.personal ? (
            <div className="row"><Bullet letter="👤" color={PERSONAL_COLOR} size={34} /><b>Personal</b><span className="mute">· just you</span></div>
          ) : g ? (
            <div className="row"><Bullet letter={groupGlyph(g)} color={g.color ?? '#A7A9AC'} size={34} /><b>{g.name}</b></div>
          ) : (
            <div className="row"><Avatar pid={d.withP ?? 'me'} size={34} /><b>1-1 with {personName(s, d.withP ?? 'me')}</b></div>
          )}
        </div>
        <label className="f" htmlFor="ttl">Title</label>
        <input id="ttl" maxLength={50} placeholder="e.g. Birthday dinner" value={d.title} onChange={(e) => set((x) => D.setMeta(x, { title: e.target.value }))} />
        <label className="f" htmlFor="loc">Location (optional)</label>
        <input id="loc" maxLength={60} placeholder="e.g. 12 Main St" value={d.loc} onChange={(e) => set((x) => D.setMeta(x, { loc: e.target.value }))} />
        <label className="f">Category</label>
        <Dropdown label="Category" value={d.cat} onChange={(v) => set((x) => D.setMeta(x, { cat: v }))} options={CATEGORIES.map((c) => ({ value: c.k, label: c.k, icon: <Bullet letter={c.k.charAt(0)} color={c.c} size={28} /> }))} />
        <label className="f" htmlFor="date">Date</label>
        <input id="date" type="date" value={d.date} onChange={(e) => e.target.value && set((x) => D.setMeta(x, { date: e.target.value }))} />
        {!d.personal && <label className="f">Who paid?</label>}
        {!d.personal && <Dropdown
          label="Who paid"
          value={payerValue}
          onChange={(v) => set((x) => D.setPayer(x, v))}
          options={[
            ...d.people.map((p) => ({ value: p, label: personName(s, p), icon: <Avatar pid={p} size={28} />, sub: s.people[p]?.user ? undefined : '· local' })),
            { value: '__multi', label: 'Several people paid…', icon: <Bullet letter="+" color="#B933AD" size={28} /> },
          ]}
        />}
        {d.multi && !d.personal && (
          <div className="card" style={{ marginTop: 10 }}>
            <div className="mute" style={{ marginBottom: 6 }}>How much did each person pay? Total {fmt(total)}</div>
            {d.people.map((p) => (
              <div className="row" style={{ padding: '4px 0' }} key={p}>
                <Avatar pid={p} size={30} />
                <div className="grow"><b>{personName(s, p)}</b></div>
                <button className="linkbtn" onClick={() => set((x) => D.paidRest(x, p))}>Rest</button>
                <MoneyField cents={d.paid[p] || 0} label={`Amount ${personName(s, p)} paid`} message="Enter a valid amount" onCommit={(c) => set((x) => D.setPaid(x, p, c))} />
              </div>
            ))}
            <div className={`bar ${left === 0 ? 'ok' : 'bad'}`} style={{ margin: '10px 0 0' }}>
              {left === 0 ? '✓ Adds up to the total' : left > 0 ? `${fmt(left)} still to be accounted for` : `${fmt(-left)} too much`}
            </div>
          </div>
        )}
        <label className="f" htmlFor="notes">{d.personal ? 'Notes' : 'Notes (shown on the shared bill)'}</label>
        <textarea id="notes" rows={3} maxLength={300} placeholder="e.g. Cab was split between the three of us" value={d.notes} onChange={(e) => set((x) => D.setMeta(x, { notes: e.target.value }))} />
      </div>
      <FlowFooter label={d.personal ? (d.editingId ? 'Save changes' : 'Save bill') : 'Continue'} disabled={!D.canContinue(d, 'details')} onClick={() => (d.personal ? save(d) : nav('/scan/summary'))} />
    </Screen>
  )
})

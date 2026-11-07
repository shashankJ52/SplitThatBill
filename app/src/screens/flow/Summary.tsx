import { useNavigate } from 'react-router-dom'
import { useDraftMoney } from '../../flow/useDraftMoney'
import { Screen } from '../../app/Screen'
import { useAppState } from '../../data/store'
import * as D from '../../domain/draft'
import { personName } from '../../domain/selectors'
import { dayLabel } from '../../domain/util'
import { ME } from '../../domain/types'
import { creditsSum, discCents, extrasSum, itemWeights, paidMap } from '../../money'
import { useSave } from '../../flow/useSave'
import { withDraft } from '../../flow/withDraft'
import { Avatar, Empty } from '../../ui/bits'
import { FlowFooter } from '../../ui/FlowFooter'

export const Summary = withDraft(function Summary({ d }: { d: D.Draft }) {
  const fmt = useDraftMoney(d)
  const nav = useNavigate()
  const s = useAppState()
  const save = useSave()
  const c = D.draftCalc(d)
  const pm = paidMap({ paid: d.multi ? d.paid : null, payer: d.payer }, c.total)
  const rows = c.rows.filter((r) => r.total > 0 || pm[r.p])
  const ex = extrasSum(d)
  const dc = discCents(d)
  const cr = creditsSum(d)
  const name = (p: string) => personName(s, p)
  const payers = Object.keys(pm).map(name).join(' & ')

  return (
    <Screen id="v-summary">
      <div className="vhead">
        <h1 className="display">Summary</h1>
        <div className="sign">
          <div className="mute">{d.title} · {dayLabel(d.date)}{d.loc ? ` · 📍 ${d.loc}` : ''} · paid by {payers}</div>
          <div className="num" style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-.05em' }}>{fmt(c.total)}</div>
          <div className="mute">{ex || dc || cr ? `Receipt ${fmt(d.rt)}${dc ? ` (after −${fmt(dc)} discount)` : ''}${ex ? ` + extras ${fmt(ex)}` : ''}${cr ? ` − extra discounts ${fmt(cr)}` : ''}` : ''}</div>
        </div>
      </div>
      <div className="vbody">
        {rows.length ? (
          rows.map((r, i) => {
            const items = d.fixed ? 'Custom amount' : d.items.filter((it) => itemWeights(d, it)?.[r.p]).map((it) => it.name).join(', ')
            const g = d.guests[r.p] || 0
            const paid = pm[r.p] || 0
            const net = r.total - paid
            const verb = r.p === ME ? 'owe' : 'owes'
            return (
              <div className="card rise" style={{ '--i': i } as React.CSSProperties} key={r.p}>
                <div className="row">
                  <Avatar pid={r.p} size={34} />
                  <div className="grow">
                    <b>{name(r.p)}{g ? <> <span className="pill">+{g}</span></> : null}</b> {s.people[r.p]?.user ? null : <span className="pill">local</span>}
                  </div>
                  <b>{paid > 0 ? `paid ${fmt(paid)}${net > 0 ? ` · owes ${fmt(net)}` : net < 0 ? ` · owed ${fmt(-net)}` : ''}` : `${verb} ${fmt(r.total)}`}</b>
                </div>
                <div className="mute" style={{ marginTop: 6 }}>{items}</div>
                <div className="mute">
                  Total share {fmt(r.total)}
                  {r.fee || r.dc || r.ex || r.cr ? (
                    <span style={{ fontSize: 12 }}> ({d.fixed ? 'custom amount ' : 'items '}{fmt(r.sub)}{r.fee ? ` + tax & tip ${fmt(r.fee)}` : ''}{r.dc ? ` − discount ${fmt(r.dc)}` : ''}{r.ex ? ` + extras ${fmt(r.ex)}` : ''}{r.cr ? ` − extra discounts ${fmt(r.cr)}` : ''})</span>
                  ) : null}
                </div>
              </div>
            )
          })
        ) : (
          <Empty title="Nothing to split" />
        )}
      </div>
      <FlowFooter label={d.editingId ? 'Save changes' : 'Continue'} disabled={!D.canContinue(d, 'summary')} onClick={() => (d.editingId ? save(d) : nav('/scan/export'))} />
    </Screen>
  )
})

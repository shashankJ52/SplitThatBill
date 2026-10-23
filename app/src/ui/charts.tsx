import { CATEGORIES } from '../domain/bills'
import type { MonthStats } from '../domain/selectors'
import { mLabel, mShort } from '../domain/util'
import { useMoney } from './useMoney'
import { Avatar, Bullet, personColor } from './bits'
import { useAppState } from '../data/store'
import { personName } from '../domain/selectors'
import type { AppLedger } from '../domain/types'
import { monthStats } from '../domain/selectors'
import { mAdd } from '../domain/util'
import type { PersonId } from '../money'

interface Seg { k: string; v: number; c: string }

function Arcs({ r, w, segs, total, sel, kind, onPick, fmt }: { fmt: (c: number) => string; r: number; w: number; segs: Seg[]; total: number; sel: string | null; kind: string; onPick: (k: string) => void }) {
  if (!total) return <circle cx="110" cy="110" r={r} fill="none" stroke="var(--line)" strokeWidth={w} />
  const C = 2 * Math.PI * r
  const gap = segs.length > 1 ? 3 : 0
  const lens = segs.map((x) => (x.v / total) * C)
  return (
    <>
      {segs.map((s, i) => {
        const dash = Math.max(lens[i] - gap, 0.5)
        const off = -lens.slice(0, i).reduce((a, b) => a + b, 0)
        return (
          <circle
            key={s.k} className={`arc${sel && sel !== s.k ? ' dim' : ''}`} cx="110" cy="110" r={r} fill="none" stroke={s.c} strokeWidth={w}
            strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={off} transform="rotate(-90 110 110)"
            role="button" tabIndex={0} aria-label={`${s.k} ${fmt(s.v)}`} data-kind={kind}
            onClick={() => onPick(s.k)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onPick(s.k)}
          />
        )
      })}
    </>
  )
}

function Donut({ outer, inner, sel, kind, center, onPick, fmt }: { fmt: (c: number) => string; outer: { segs: Seg[]; total: number }; inner: { segs: Seg[]; total: number }; sel: string | null; kind: string; center: React.ReactNode; onPick: (k: string) => void }) {
  return (
    <div className="donut">
      <svg viewBox="0 0 220 220" role="img" aria-label="Spending chart">
        <Arcs r={90} w={26} {...outer} sel={sel} kind={kind} onPick={onPick} fmt={fmt} />
        <Arcs r={58} w={16} {...inner} sel={sel} kind={kind} onPick={onPick} fmt={fmt} />
      </svg>
      <div className="dc">{center}</div>
    </div>
  )
}

export function PeopleChart({ ledger, st, pick, onPick }: { ledger: AppLedger; st: MonthStats; pick: string | null; onPick: (k: string) => void }) {
  const s = useAppState()
  const fmt = useMoney(ledger)
  const sg: Seg[] = []
  const pg: Seg[] = []
  for (const p of ledger.members) {
    if (st.share[p] > 0) sg.push({ k: p, v: st.share[p], c: personColor(s.people, p) })
    if (st.paid[p] > 0) pg.push({ k: p, v: st.paid[p], c: personColor(s.people, p) })
  }
  const sel = pick && (st.share[pick] > 0 || st.paid[pick] > 0) ? pick : null
  const center = !st.tot ? (
    <><div className="dl">No spending</div><div className="ds">nothing this month</div></>
  ) : sel ? (
    <>
      <div className="dl">{personName(s, sel)}</div>
      <div className="dn">{fmt(st.share[sel] ?? 0)}</div>
      <div className="ds">{Math.round(((st.share[sel] ?? 0) / st.tot) * 100)}% of spend</div>
      <div className="ds">paid {fmt(st.paid[sel] ?? 0)}</div>
    </>
  ) : (
    <><div className="dl">Total spend</div><div className="dn">{fmt(st.tot)}</div><div className="ds">{st.n} bill{st.n === 1 ? '' : 's'}</div></>
  )
  return (
    <>
      <Donut outer={{ segs: sg, total: st.tot }} inner={{ segs: pg, total: st.tot }} sel={sel} kind="p" center={center} onPick={onPick} fmt={fmt} />
      <div className="mute" style={{ textAlign: 'center', fontSize: 12, margin: '6px 0' }}>Outer ring: each person's share. Inner ring: what each person paid.</div>
      {ledger.members.filter((p) => st.share[p] > 0 || st.paid[p] > 0).map((p) => (
        <button key={p} className={`lg${sel === p ? ' on' : ''}`} onClick={() => onPick(p)} aria-pressed={sel === p}>
          <Avatar pid={p} size={30} />
          <span className="grow"><b>{personName(s, p)}</b><span className="mute" style={{ display: 'block', fontSize: 12 }}>paid {fmt(st.paid[p] ?? 0)}</span></span>
          <span><b>{fmt(st.share[p] ?? 0)}</b> <span className="mute">{st.tot ? Math.round(((st.share[p] ?? 0) / st.tot) * 100) : 0}%</span></span>
        </button>
      ))}
    </>
  )
}

export function CategoryChart({ ledger, st, prev, monthKey, pick, onPick }: { ledger: AppLedger; st: MonthStats; prev: MonthStats; monthKey: string; pick: string | null; onPick: (k: string) => void }) {
  const fmt = useMoney(ledger)
  const seg = (m: MonthStats): Seg[] => CATEGORIES.filter((c) => m.cat[c.k] > 0).map((c) => ({ k: c.k, v: m.cat[c.k], c: c.c }))
  const sel = pick && st.cat[pick] > 0 ? pick : null
  const pl = mShort(mAdd(monthKey, -1))
  const center = !st.tot ? (
    <><div className="dl">No spending</div><div className="ds">nothing this month</div></>
  ) : sel ? (
    <>
      <div className="dl">{sel}</div>
      <div className="dn">{fmt(st.cat[sel])}</div>
      <div className="ds">{Math.round((st.cat[sel] / st.tot) * 100)}% of month</div>
      <div className="ds">{st.cat[sel] - (prev.cat[sel] ?? 0) > 0 ? '+' : ''}{fmt(st.cat[sel] - (prev.cat[sel] ?? 0))} vs {pl}</div>
    </>
  ) : (
    <><div className="dl">Total spend</div><div className="dn">{fmt(st.tot)}</div><div className="ds">{st.n} bill{st.n === 1 ? '' : 's'}</div></>
  )
  return (
    <>
      <Donut outer={{ segs: seg(st), total: st.tot }} inner={{ segs: seg(prev), total: prev.tot }} sel={sel} kind="c" center={center} onPick={onPick} fmt={fmt} />
      <div className="mute" style={{ textAlign: 'center', fontSize: 12, margin: '6px 0' }}>Outer ring: {mLabel(monthKey)}. Inner ring: {mLabel(mAdd(monthKey, -1))}.</div>
      {CATEGORIES.filter((c) => st.cat[c.k] > 0 || prev.cat[c.k] > 0).map((c) => {
        const a = st.cat[c.k] ?? 0
        return (
          <button key={c.k} className={`lg${sel === c.k ? ' on' : ''}`} onClick={() => onPick(c.k)} aria-pressed={sel === c.k}>
            <Bullet letter={c.k.charAt(0)} color={c.c} size={30} />
            <span className="grow"><b>{c.k}</b><span className="mute" style={{ display: 'block', fontSize: 12 }}>{pl} {fmt(prev.cat[c.k] ?? 0)}</span></span>
            <span><b>{fmt(a)}</b> <span className="mute">{st.tot ? Math.round((a / st.tot) * 100) : 0}%</span></span>
          </button>
        )
      })}
    </>
  )
}

export interface TrendState { all: boolean; people: boolean; off: string[]; st: { k: string; i: number } | null }

/** A subway-map style line chart: one line per person plus the whole group, a station per month. */
export function TrendChart({ ledger, monthKey, state, onChange, solo }: { ledger: AppLedger; monthKey: string; state: TrendState; onChange: (t: TrendState) => void; solo?: boolean }) {
  const s = useAppState()
  const fmt = useMoney(ledger)
  const ms = [mAdd(monthKey, -2), mAdd(monthKey, -1), monthKey]
  const xs = [52, 176, 300]
  const ss = ms.map((m) => monthStats(ledger, m))
  const series = [
    { k: '__all', l: 'Whole group', c: ledger.color ?? '#0039A6', v: ss.map((x) => x.tot) },
    ...ledger.members.map((p: PersonId) => ({ k: p, l: personName(s, p), c: personColor(s.people, p), v: ss.map((x) => x.share[p] ?? 0) })),
  ]
  const vis = series.filter((x) => (x.k === '__all' ? state.all : state.people && !state.off.includes(x.k)))
  const max = Math.max(1, ...vis.flatMap((x) => x.v))
  const Y = (v: number) => Math.round((172 - (v / max) * 128) * 10) / 10
  const pv = vis.filter((x) => x.k !== '__all')
  const off = (k: string) => {
    const i = pv.findIndex((x) => x.k === k)
    return i < 0 ? 0 : (i - (pv.length - 1) / 2) * 7
  }
  const Yo = (k: string, v: number) => Math.round((Y(v) + off(k)) * 10) / 10
  const picked = state.st ? series.find((x) => x.k === state.st?.k) : null
  const toggle = (k: string) => {
    if (k === '__all') onChange({ ...state, all: !state.all })
    else if (k === '__people') onChange({ ...state, people: !state.people })
    else onChange({ ...state, off: state.off.includes(k) ? state.off.filter((x) => x !== k) : [...state.off, k] })
  }
  const chip = (k: string, on: boolean, icon: React.ReactNode, label: string) => (
    <button key={k} className={`fchip${on ? ' on' : ' plain'}`} aria-pressed={on} onClick={() => toggle(k)}>{icon}{label}</button>
  )
  return (
    <>
      <svg viewBox="0 0 352 218" role="img" aria-label="Spending trend, last three months">
        {[0, 0.5, 1].map((f) => <line key={f} className="tl-gr" x1="24" x2="336" y1={Y(max * f)} y2={Y(max * f)} />)}
        <text className="tl-tx" x="336" y={Y(max) - 8} textAnchor="end" style={{ fontWeight: 400 }}>{fmt(max)}</text>
        {vis.slice().reverse().map((x) => {
          const pts = x.v.map((v, i) => `${xs[i]},${Yo(x.k, v)}`).join(' ')
          const big = x.k === '__all'
          return (
            <g key={x.k}>
              <polyline className="tl-bg" points={pts} strokeWidth={big ? 15 : 12} />
              <polyline className="tl-ln" points={pts} stroke={x.c} strokeWidth={big ? 9 : 6} />
            </g>
          )
        })}
        {vis.map((x) => x.v.map((v, i) => (
          <g key={`${x.k}${i}`}>
            <circle className="tl-hit" cx={xs[i]} cy={Yo(x.k, v)} r="17" onClick={() => onChange({ ...state, st: { k: x.k, i } })} aria-hidden="true" />
            <circle className="tl-st" cx={xs[i]} cy={Yo(x.k, v)} r={x.k === '__all' ? 9 : 6} role="button" tabIndex={0} aria-label={`${x.l}, ${mLabel(ms[i])}, ${fmt(v)}`}
              onClick={() => onChange({ ...state, st: { k: x.k, i } })} onKeyDown={(e) => e.key === 'Enter' && onChange({ ...state, st: { k: x.k, i } })} />
          </g>
        )))}
        {ms.map((m, i) => <text key={m} className="tl-tx" x={xs[i]} y="210" textAnchor="middle">{mShort(m)}</text>)}
      </svg>
      <div className="mute" style={{ textAlign: 'center', minHeight: 20 }}>
        {picked && state.st ? <><b>{picked.l}</b> · {mLabel(ms[state.st.i])}: <b>{fmt(picked.v[state.st.i])}</b></> : 'Tap a station for amounts.'}
      </div>
      <div style={{ marginTop: 10 }}>
        {chip('__all', state.all, <Bullet letter={solo ? '$' : 'G'} color={ledger.color ?? '#0039A6'} size={24} />, solo ? 'All spending' : 'Whole group')}
        {!solo && chip('__people', state.people, <Bullet letter="P" color="#A7A9AC" size={24} />, 'People lines')}
        {state.people && ledger.members.map((p) => chip(p, !state.off.includes(p), <Avatar pid={p} size={24} />, personName(s, p)))}
      </div>
    </>
  )
}

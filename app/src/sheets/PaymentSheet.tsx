import { useAppState } from '../data/store'
import { ledgerById, ledgerName, personName, type MergedPayment } from '../domain/selectors'
import { fmt } from '../domain/util'
import { Bullet } from '../ui/bits'

/** The details of one payment: who paid whom, when, the note, the proof image, and where it was applied. */
export function PaymentSheet({ p, close }: { p: MergedPayment; close: () => void }) {
  const s = useAppState()
  const when = p.ts ? new Date(p.ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : p.date
  return (
    <>
      <div className="row" style={{ marginBottom: 10 }}>
        <Bullet letter="$" color="#00933C" size={44} />
        <div className="grow">
          <div className="gname">{personName(s, p.from)} paid {personName(s, p.to)}</div>
          <div className="mute">{when}</div>
        </div>
        <b style={{ fontSize: 22 }}>{fmt(p.amt)}</b>
      </div>
      {p.note ? (
        <div className="card" style={{ display: 'block' }}>
          <div className="mute">Note</div>
          {p.note}
        </div>
      ) : (
        <div className="mute" style={{ marginBottom: 8 }}>No note was added.</div>
      )}
      {p.img ? <img src={p.img} alt="Payment proof" style={{ width: '100%', borderRadius: 10, margin: '8px 0' }} /> : <div className="mute" style={{ marginBottom: 8 }}>No screenshot or photo was attached.</div>}
      {p.parts.length > 1 && (
        <>
          <label className="f">Where it was applied</label>
          <div className="card lines" style={{ display: 'block' }}>
            {p.parts.map((x, i) => {
              const l = ledgerById(s, x.ledgerId)
              return (
                <div key={i}>
                  <span>{l ? ledgerName(s, l) : 'A split'}</span>
                  <span>{fmt(x.amt)}</span>
                </div>
              )
            })}
          </div>
        </>
      )}
      <div style={{ height: 12 }} />
      <button className="secondary" onClick={close}>Close</button>
    </>
  )
}

import { useNavigate } from 'react-router-dom'
import { Screen } from '../../app/Screen'
import type { Draft } from '../../domain/draft'
import { fmt } from '../../domain/util'
import { withDraft } from '../../flow/withDraft'
import { FlowFooter } from '../../ui/FlowFooter'
import { useToast } from '../../ui/Toast'

const mask = (t: string) => <span className="redact">{t}</span>

export const Privacy = withDraft(function Privacy({ d }: { d: Draft }) {
  const nav = useNavigate()
  const toast = useToast()
  if (d.scanned) return <ScannedPrivacy d={d} onContinue={() => nav('/scan/review')} />
  return (
    <Screen id="v-privacy">
      <div className="vhead">
        <h1 className="display">Privacy filter</h1>
        <div className="bar ok">🔒 4 sensitive items hidden</div>
      </div>
      <div className="vbody">
        <div className="receipt">
          {`${d.title.toUpperCase()}\n${d.loc}\n------------------------\n`}
          {d.items.map((i) => `${i.name.padEnd(18)}${fmt(i.price)}\n`).join('')}
          {`------------------------\nTotal            ${fmt(d.rt)}\n\nVISA `}
          {mask('**** **** **** 4242')}
          {'\nExp '}
          {mask('09/28')}
          {'  Auth '}
          {mask('A83F21')}
          {'\n'}
          {mask('JAMES R DOE')}
        </div>
        <ul className="mute">
          <li>Card number</li>
          <li>Expiry date</li>
          <li>Authorization code</li>
          <li>Cardholder name</li>
        </ul>
        <button className="secondary" onClick={() => toast('Hiding extra parts comes with real scanning')}>+ Hide something else</button>
        <p className="mute">The original photo is never stored. Filtering is best effort, so check before sharing.</p>
      </div>
      <FlowFooter label="Continue" onClick={() => nav('/scan/review')} />
    </Screen>
  )
})

/** After a real scan: say what private details were seen and left out, and what was read instead. */
function ScannedPrivacy({ d, onContinue }: { d: Draft; onContinue: () => void }) {
  const hidden = d.hidden ?? []
  return (
    <Screen id="v-privacy">
      <div className="vhead">
        <h1 className="display">Privacy filter</h1>
        <div className="bar ok">🔒 {hidden.length ? `${hidden.length} sensitive ${hidden.length === 1 ? 'detail' : 'details'} left out` : 'Nothing sensitive spotted'}</div>
      </div>
      <div className="vbody">
        {hidden.length ? (
          <>
            <p className="mute">These were seen on the receipt and left out:</p>
            <ul className="mute">
              {hidden.map((h) => (
                <li key={h}>{h[0].toUpperCase() + h.slice(1)}</li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mute">No card numbers, names or codes were spotted on this receipt.</p>
        )}
        <div className="receipt">
          {`${d.title.toUpperCase()}${d.loc ? `\n${d.loc}` : ''}\n------------------------\n`}
          {d.items.map((i) => `${i.qty > 1 ? `${i.qty}x ` : ''}${i.name}`.padEnd(22).slice(0, 22) + fmt(i.price) + '\n').join('')}
          {`------------------------\nTotal                 ${fmt(d.rt)}`}
        </div>
        <p className="mute">Only the items and amounts above carry on. Your photo is not stored, and reading it is best effort, so check the next screen against your receipt.</p>
      </div>
      <FlowFooter label="Continue" onClick={onContinue} />
    </Screen>
  )
}

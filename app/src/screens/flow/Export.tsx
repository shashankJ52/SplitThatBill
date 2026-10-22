import { useNavigate } from 'react-router-dom'
import { Screen } from '../../app/Screen'
import { useAppState } from '../../data/store'
import * as D from '../../domain/draft'
import { ledgerById } from '../../domain/selectors'
import { billLink, whatsappText } from '../../domain/share'
import { useSave } from '../../flow/useSave'
import { withDraft } from '../../flow/withDraft'
import { FlowFooter } from '../../ui/FlowFooter'
import { buildExportModel } from '../../share/exportModel'
import { ShareImageSheet } from '../../sheets/ShareImageSheet'
import { useSheet } from '../../ui/Sheet'
import { useToast } from '../../ui/Toast'

export const Export = withDraft(function Export({ d }: { d: D.Draft }) {
  const nav = useNavigate()
  const s = useAppState()
  const toast = useToast()
  const sheet = useSheet()
  const save = useSave()
  const g = d.gid ? ledgerById(s, d.gid) : null
  const link = billLink(window.location.origin, d.token)
  const text = whatsappText(s, { ...d, paid: d.multi ? d.paid : null }, g?.name ?? null, link, D.draftCurrency(s, d))
  const copy = async (t: string, ok: string) => {
    try {
      await navigator.clipboard.writeText(t)
      toast(ok)
    } catch {
      toast('Copy blocked. Select the text manually.')
    }
  }

  return (
    <Screen id="v-export">
      <div className="vhead"><h1 className="display">Share</h1></div>
      <div className="vbody">
        <label className="f" htmlFor="wa" style={{ marginTop: 0 }}>WhatsApp message</label>
        <textarea id="wa" rows={9} readOnly value={text} />
        <div style={{ height: 10 }} />
        <button className="primary" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener')}>Open in WhatsApp</button>
        <div style={{ height: 10 }} />
        <button className="secondary" onClick={() => copy(text, 'Copied')}>Copy text</button>
        <label className="f" htmlFor="lnk">Link to this bill</label>
        <div className="linkbox">
          <input id="lnk" readOnly value={link} aria-label="Bill link" />
          <button className="secondary" onClick={() => copy(link, 'Link copied')}>Copy</button>
        </div>
        <p className="mute">Anyone can open it without the app. It shows only this bill, how it's split and your notes. No balances or account details. The link starts working once you save the bill.</p>
        <button className="secondary" onClick={() => nav('/preview/draft')}>Preview what friends see</button>
        <div style={{ height: 10 }} />
        <button
          className="secondary"
          onClick={() => {
            const m = buildExportModel(s, { ...d, paid: d.multi ? d.paid : null }, { groupName: g?.name ?? null, currency: D.draftCurrency(s, d), link })
            sheet.open('Share this bill', (close) => <ShareImageSheet model={m} linkWorks={false} close={close} />)
          }}
        >
          Share as a picture or PDF
        </button>
      </div>
      <FlowFooter label="Save bill" onClick={() => save(d)} />
    </Screen>
  )
})

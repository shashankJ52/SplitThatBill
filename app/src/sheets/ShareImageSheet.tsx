import { useMemo, useState } from 'react'
import { drawExport, exportFileName, LOOKS, type Look, type Theme } from '../share/drawExport'
import type { ExportModel } from '../share/exportModel'
import { Seg } from '../ui/bits'
import { useTheme } from '../ui/useTheme'
import { useToast } from '../ui/Toast'

const toBlob = (c: HTMLCanvasElement) => new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'))

/**
 * Turn a bill into a picture to send out: pick a look (station sign, receipt or square), light or dark, and whether the
 * bill link goes on it. The picture is drawn here on the device, so nothing about it is uploaded.
 */
export function ShareImageSheet({ model, linkWorks, close }: { model: ExportModel; linkWorks: boolean; close: () => void }) {
  const toast = useToast()
  const { theme: appTheme } = useTheme()
  const [look, setLook] = useState<Look>('sign')
  const [theme, setTheme] = useState<Theme>(appTheme)
  const [withLink, setWithLink] = useState(linkWorks && !!model.link)
  const [busy, setBusy] = useState(false)

  const { canvas, url } = useMemo(() => {
    const c = drawExport(model, look, theme, withLink)
    return { canvas: c, url: c.toDataURL('image/png') }
  }, [model, look, theme, withLink])

  const canShareFiles = typeof navigator.canShare === 'function' && typeof navigator.share === 'function'
  const canCopy = typeof ClipboardItem !== 'undefined' && !!navigator.clipboard?.write

  const file = async () => {
    const blob = await toBlob(canvas)
    return blob ? new File([blob], exportFileName(model.title), { type: 'image/png' }) : null
  }
  const save = async () => {
    const f = await file()
    if (!f) return toast('Could not make the picture')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(f)
    a.download = f.name
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 4000)
    toast('Picture saved')
  }
  const share = async () => {
    setBusy(true)
    try {
      const f = await file()
      if (!f) return toast('Could not make the picture')
      if (canShareFiles && navigator.canShare({ files: [f] })) await navigator.share({ files: [f], title: model.title })
      else await save()
    } catch (e) {
      // closing the share sheet is not an error
      if (!(e instanceof DOMException && e.name === 'AbortError')) toast('Could not share the picture. Try Save instead.')
    } finally {
      setBusy(false)
    }
  }
  const copy = async () => {
    try {
      const blob = await toBlob(canvas)
      if (!blob) return toast('Could not make the picture')
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      toast('Picture copied')
    } catch {
      toast('Copy blocked. Use Save instead.')
    }
  }

  return (
    <>
      <Seg<Look> label="Look" value={look} onChange={setLook} options={LOOKS.map((l) => ({ value: l.value, label: l.label }))} />
      <div className="mute" style={{ margin: '6px 0 10px' }}>{LOOKS.find((l) => l.value === look)?.hint}</div>
      <div style={{ maxHeight: 340, overflow: 'auto', borderRadius: 12, border: '1px solid var(--line)', background: 'var(--card)' }}>
        {url ? <img src={url} alt={`Preview of the ${LOOKS.find((l) => l.value === look)?.label.toLowerCase()} picture`} style={{ display: 'block', width: '100%' }} /> : <div style={{ height: 200 }} />}
      </div>
      <div className="row" style={{ marginTop: 12, gap: 12 }}>
        <div className="grow">
          <Seg<Theme> label="Colors" value={theme} onChange={setTheme} options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }]} />
        </div>
      </div>
      {model.link && (
        <label className="switch" style={{ margin: '12px 0 4px' }}>
          <input type="checkbox" checked={withLink} onChange={(e) => setWithLink(e.target.checked)} />
          <span>
            <b>Put the bill link on it</b>
            <div className="mute">{linkWorks ? 'Friends can open the full split.' : 'The link starts working once you save the bill.'}</div>
          </span>
        </label>
      )}
      <div style={{ height: 10 }} />
      <button className="primary" disabled={busy} onClick={() => void share()}>{canShareFiles ? 'Share picture' : 'Save picture'}</button>
      <div style={{ height: 10 }} />
      <div className="btnrow">
        {canShareFiles && <button className="secondary" onClick={() => void save()}>Save</button>}
        {canCopy && <button className="secondary" onClick={() => void copy()}>Copy</button>}
        <button className="secondary" onClick={close}>Close</button>
      </div>
    </>
  )
}

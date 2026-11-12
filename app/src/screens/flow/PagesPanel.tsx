import { useEffect, useRef, useState } from 'react'
import { isPdf, MAX_PAGES } from '../../scan/pages'
import { ChevronIcon, CloseIcon } from '../../ui/icons'

/**
 * The photos of one receipt, in the order they will be read, top to bottom. A long receipt is often captured as several
 * screenshots that overlap a little; the reader counts a repeated line once, so overlap is fine.
 */
export function PagesPanel({ files, busy, onMove, onRemove, onCamera, onGallery, onRead, onCancel, readLabel }: {
  files: File[]
  busy: boolean
  onMove: (i: number, dir: -1 | 1) => void
  onRemove: (i: number) => void
  onCamera: () => void
  onGallery: () => void
  onRead: () => void
  onCancel: () => void
  readLabel: string
}) {
  // preview addresses are made, and released, in an effect so they are never released while still shown
  const [urls, setUrls] = useState<(string | null)[]>([])
  useEffect(() => {
    const made = files.map((f) => (isPdf(f) ? null : URL.createObjectURL(f)))
    setUrls(made)
    return () => made.forEach((u) => u && URL.revokeObjectURL(u))
  }, [files])
  // when the panel opens, bring it into view: it sits under the choice of who to split with
  const top = useRef<HTMLDivElement>(null)
  useEffect(() => {
    top.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [])
  const full = files.length >= MAX_PAGES || files.some(isPdf)

  return (
    <div className="pages" ref={top}>
      <h2>Photos of this receipt ({files.length} of {MAX_PAGES})</h2>
      <p className="mute">Add them in order, top of the receipt first. If they overlap a little that is fine: a line seen twice is counted once.</p>
      {files.length === 0 && <div className="empty sm"><b>No photos yet</b>Take one or choose several from your gallery.</div>}
      <ol className="page-list">
        {files.map((f, i) => (
          <li className="page" key={`${f.name}:${f.size}:${i}`}>
            <span className="page-n" aria-hidden="true">{i + 1}</span>
            {urls[i] ? <img src={urls[i] as string} alt={`Photo ${i + 1}`} /> : <span className="page-pdf" aria-hidden="true">PDF</span>}
            <span className="grow mute page-name">{f.name || `Photo ${i + 1}`}</span>
            <button type="button" className="mv" aria-label={`Move photo ${i + 1} earlier`} disabled={busy || i === 0} onClick={() => onMove(i, -1)}><ChevronIcon up /></button>
            <button type="button" className="mv" aria-label={`Move photo ${i + 1} later`} disabled={busy || i === files.length - 1} onClick={() => onMove(i, 1)}><ChevronIcon /></button>
            <button type="button" className="del" aria-label={`Remove photo ${i + 1}`} disabled={busy} onClick={() => onRemove(i)}><CloseIcon /></button>
          </li>
        ))}
      </ol>
      <div className="btnrow" style={{ margin: '4px 0 10px' }}>
        <button type="button" className="secondary" disabled={busy || full} onClick={onCamera}>Take another</button>
        <button type="button" className="secondary" disabled={busy || full} onClick={onGallery}>From gallery</button>
      </div>
      <button type="button" className="primary" disabled={busy || files.length === 0} onClick={onRead}>{readLabel}</button>
      <div style={{ height: 8 }} />
      <button type="button" className="linkbtn" disabled={busy} onClick={onCancel}>Cancel, back to one photo</button>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Screen } from '../../app/Screen'
import { useAccount, useAccountMode } from '../../data/account'
import { useAppState, useStore } from '../../data/store'
import * as D from '../../domain/draft'
import { groupGlyph, ledgerById, personName, realGroups, recentGroups, recentPeople, splitPeople, others } from '../../domain/selectors'
import { ME } from '../../domain/types'
import { useAddPerson } from '../../ui/useAddPerson'
import { useFlow } from '../../flow/FlowProvider'
import { GroupSheet } from '../../sheets/GroupSheet'
import * as A from '../../data/actions'
import { PERSONAL_COLOR } from '../../data/actions'
import { PickSheet } from '../../sheets/PickSheet'
import { Avatar, Bullet } from '../../ui/bits'
import { useSheet } from '../../ui/Sheet'
import { useToast } from '../../ui/Toast'
import { limitMessage, prepareFiles, scanReceipt, ScanError } from '../../scan/client'
import { addFiles, movePage, removeAt, skippedMessage } from '../../scan/pages'
import { PagesPanel } from './PagesPanel'
import { CloseIcon } from '../../ui/icons'

export function Capture() {
  const { draft: d, set, begin } = useFlow()
  const loc = useLocation()
  const nav = useNavigate()
  const s = useAppState()
  const store = useStore()
  const sheet = useSheet()
  const toast = useToast()
  const addByInput = useAddPerson()
  const [newName, setNewName] = useState('')
  const [bad, setBad] = useState(false)
  const [reading, setReading] = useState(false)
  const [stage, setStage] = useState<'prep' | 'read'>('prep')
  const busy = useRef(false)
  // the photos of one receipt, when it has more than one; the usual single photo is read straight away
  const [pages, setPages] = useState<File[]>([])
  const [multi, setMulti] = useState(false)
  const camRef = useRef<HTMLInputElement>(null)
  const galRef = useRef<HTMLInputElement>(null)
  const account = useAccount()
  // only a signed-in account can read real receipts; the demo keeps the sample receipt
  const real = useAccountMode() === 'cloud'
  const want = (loc.state as { target?: string | null } | null)?.target

  useEffect(() => {
    if (!d) begin(want)
  }, [d, begin, want])
  // wake the scanning function while you choose the photo, so the first scan does not wait for it to start
  useEffect(() => {
    if (real) void fetch('/api/scan', { cache: 'no-store' }).catch(() => undefined)
  }, [real])
  if (!d) return null

  const sel = d.target
  const rg = recentGroups(s, 5)
  const rp = recentPeople(s, 5)
  if (sel.startsWith('g:')) {
    const g = ledgerById(s, sel.slice(2))
    if (g && !rg.includes(g)) rg.unshift(g)
  }
  if (sel.startsWith('p:') && !rp.includes(sel.slice(2))) rp.unshift(sel.slice(2))

  const pick = (t: string) => {
    // someone chosen from "All people" is wanted again, so they come back as a suggestion
    if (t.startsWith('p:')) store.update((st) => A.showScanPerson(st, t.slice(2)))
    set((x) => D.setTarget(store.get(), x, t))
  }
  const selGroup = sel.startsWith('g:') ? ledgerById(s, sel.slice(2)) : null

  /** Turn "Someone new" into a real person before moving on. Returns the draft to continue with. */
  const settle = async (): Promise<D.Draft | null> => {
    if (d.target !== 'new') return d
    const r = await addByInput(newName, [ME])
    if (r.err || !r.id) {
      toast(r.err ?? 'Enter a name or @usertag')
      setBad(true)
      return null
    }
    return D.setTarget(store.get(), d, `p:${r.id}`)
  }
  const proceed = async () => {
    let cur = await settle()
    if (!cur) return
    if (cur.manual) cur = D.loadSample(cur)
    const next = cur
    set(() => next)
    nav('/scan/privacy')
  }
  const manual = async () => {
    const cur = await settle()
    if (!cur) return
    const next = D.startManual(cur)
    set(() => next)
    nav('/scan/review')
  }
  /** Read the chosen photos (or the one PDF), then move on to the privacy screen with what was found. */
  const readPages = async (files: File[]) => {
    if (!files.length || busy.current) return
    if (!real) return void proceed()
    busy.current = true
    setReading(true)
    setStage('prep')
    // shrinking the photos starts straight away, while the rest is checked, instead of after it
    const prepared = prepareFiles(files)
    prepared.catch(() => undefined)
    try {
      const cur = await settle()
      if (!cur) return
      const token = await account?.accessToken()
      if (!token) return toast('Sign in again to scan receipts.')
      const photos = await prepared
      setStage('read')
      const { scan } = await scanReceipt(photos, token)
      const next = D.loadScan(cur, scan, files.length)
      set(() => next)
      nav('/scan/privacy')
    } catch (e) {
      toast(e instanceof ScanError ? (e.code === 'limit' ? limitMessage(e) : e.message) : 'Something went wrong reading that. You can enter the items yourself.')
    } finally {
      busy.current = false
      setReading(false)
    }
  }
  /** Add picked files to the receipt's photos (and show them), telling the person about any that were left out. */
  const addPicked = (picked: File[]) => {
    const r = addFiles(pages, picked)
    setPages(r.files)
    setMulti(true)
    if (r.skipped) toast(skippedMessage(r))
  }
  const picked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = [...(e.target.files ?? [])]
    e.target.value = ''
    return list
  }
  /** A camera shot is one photo: read it at once, unless this receipt is being built from several. */
  const onCamera = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = picked(e)
    if (!list.length) return
    if (multi) return addPicked(list)
    const r = addFiles([], list.slice(0, 1))
    if (r.skipped) return toast(skippedMessage(r))
    void readPages(r.files)
  }
  /** One file from the gallery is read at once as before; two or more become the photos of one long receipt. */
  const onGallery = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = picked(e)
    if (!list.length) return
    if (multi || list.length > 1) return addPicked(list)
    const r = addFiles([], list)
    if (r.skipped) return toast(skippedMessage(r))
    void readPages(r.files)
  }
  const stopMulti = () => {
    setPages([])
    setMulti(false)
  }

  return (
    <Screen id="v-capture">
      <div className="vhead"><h1 className="display">Scan receipt</h1></div>
      <div className="vbody">
        <label className="f" style={{ marginTop: 0 }}>Split with</label>
        <div className="mute" style={{ marginBottom: 6 }}>
          {selGroup ? (
            <div className="row">
              <Bullet letter={groupGlyph(selGroup)} color={selGroup.color ?? '#A7A9AC'} size={30} />
              <b style={{ color: 'var(--fg)' }}>{selGroup.name}</b>
              <span>· {splitPeople(selGroup).length} people</span>
            </div>
          ) : sel === 'me' ? (
            <div className="row">
              <Bullet letter="👤" color={PERSONAL_COLOR} size={30} />
              <b style={{ color: 'var(--fg)' }}>Personal</b>
              <span>· just you, nothing to split</span>
            </div>
          ) : sel.startsWith('p:') ? (
            <div className="row">
              <Avatar pid={sel.slice(2)} size={32} />
              <b style={{ color: 'var(--fg)' }}>1-1 with {personName(s, sel.slice(2))}</b>
            </div>
          ) : (
            "Pick who you're splitting with, or add someone new."
          )}
        </div>
        <div style={{ marginTop: 10 }}>
          <button className={`fchip${sel === 'me' ? ' on' : ''}`} onClick={() => pick('me')}>
            <Bullet letter="👤" color={PERSONAL_COLOR} size={28} />
            Personal
          </button>
        </div>
        <h2 style={{ margin: '10px 0 8px' }}>Recent groups</h2>
        <div>
          {rg.map((g) => (
            <button key={g.id} className={`fchip${sel === `g:${g.id}` ? ' on' : ''}`} onClick={() => pick(`g:${g.id}`)}>
              <Bullet letter={groupGlyph(g)} color={g.color ?? '#A7A9AC'} size={28} />
              {g.name}
            </button>
          ))}
          {realGroups(s).length > 5 && (
            <button className="fchip plain" onClick={() => sheet.open('All groups', (close) => <PickSheet mode="g" onPick={pick} close={close} />)}>All groups…</button>
          )}
          <button className="fchip plain" onClick={() => sheet.open('New group', (close) => <GroupSheet onCreated={(id) => pick(`g:${id}`)} close={close} />)}>+ New group</button>
        </div>
        <h2 style={{ margin: '6px 0 8px' }}>Just two of you (1-1)</h2>
        <div>
          {rp.map((p) => (
            <span className="chipx" key={p}>
              <button className={`fchip${sel === `p:${p}` ? ' on' : ''}`} onClick={() => pick(`p:${p}`)}>
                <Avatar pid={p} size={28} />
                {personName(s, p)}
              </button>
              {sel !== `p:${p}` && (
                <button className="chipx-x" aria-label={`Remove ${personName(s, p)} from these suggestions`} title="Remove from suggestions" onClick={() => store.update((st) => A.hideScanPerson(st, p))}><CloseIcon /></button>
              )}
            </span>
          ))}
          {others(s).length > rp.length && (
            <button className="fchip plain" onClick={() => sheet.open('All people', (close) => <PickSheet mode="p" onPick={pick} close={close} />)}>All people…</button>
          )}
          <button className={`fchip plain${sel === 'new' ? ' on' : ''}`} onClick={() => pick('new')}>+ Someone new</button>
        </div>
        {sel === 'new' && (
          <div>
            <label className="f" htmlFor="cap-new">Name or @usertag</label>
            <input id="cap-new" className={bad ? 'bad' : ''} maxLength={30} placeholder="e.g. Marie or @marie" value={newName} onChange={(e) => { setNewName(e.target.value); setBad(false) }} />
          </div>
        )}
        <input ref={camRef} type="file" accept="image/*" capture="environment" hidden disabled={reading} onChange={onCamera} />
        <input ref={galRef} type="file" accept="image/*,application/pdf" multiple hidden disabled={reading} onChange={onGallery} />
        {reading ? (
          <div className="empty" style={{ marginTop: 10, padding: '28px 14px' }}>
            {stage === 'prep' ? (
              <><b>Preparing your photo{pages.length > 1 ? 's' : ''}…</b>Step 1 of 2</>
            ) : (
              <><b>Reading your receipt…</b>Step 2 of 2. {pages.length > 1 ? `Putting ${pages.length} photos together can take a little longer.` : 'This usually takes a few seconds.'}</>
            )}
          </div>
        ) : multi ? (
          <PagesPanel
            files={pages}
            busy={reading}
            onMove={(i, dir) => setPages((p) => movePage(p, i, dir))}
            onRemove={(i) => setPages((p) => removeAt(p, i))}
            onCamera={() => camRef.current?.click()}
            onGallery={() => galRef.current?.click()}
            onRead={() => void readPages(pages)}
            onCancel={stopMulti}
            readLabel={pages.length > 1 ? `Read these ${pages.length} photos as one receipt` : 'Read receipt'}
          />
        ) : (
          <>
            <div className="empty" style={{ marginTop: 10, padding: '28px 14px' }}>
              {real ? (
                <><b>Photograph the whole receipt</b>Lay it flat in good light so every line is readable.</>
              ) : (
                <><b>Camera preview</b>Sign in to scan real receipts. In the demo, any photo loads a sample receipt.</>
              )}
            </div>
            {real ? (
              <button className="primary" onClick={() => camRef.current?.click()}>Take photo</button>
            ) : (
              <button className="primary" onClick={() => void proceed()}>Take photo (sample receipt)</button>
            )}
            <div style={{ height: 10 }} />
            <button className="secondary" onClick={() => galRef.current?.click()}>Upload a bill</button>
            <button className="linkbtn" style={{ margin: '8px 0 0' }} onClick={() => setMulti(true)}>Long receipt? Add several photos</button>
            <div style={{ height: 10 }} />
            <button className="secondary" onClick={() => void manual()}>No receipt? Enter items yourself</button>
          </>
        )}
        <p className="mute">
          {real
            ? 'We never store your photo. It is sent once to Claude, Anthropic’s AI, only to read the items, and card numbers and names are left out. 20 scans a day.'
            : 'Your photo is never stored.'}
        </p>
      </div>
    </Screen>
  )
}

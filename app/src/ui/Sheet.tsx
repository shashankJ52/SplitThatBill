import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

interface Entry {
  title: string
  render: (close: () => void) => ReactNode
}
interface SheetApi {
  open: (title: string, render: (close: () => void) => ReactNode) => void
  close: () => void
  isOpen: boolean
}
const Ctx = createContext<SheetApi | null>(null)

/** One bottom sheet at a time, like the wireframe. Content is kept while it slides away. */
export function SheetProvider({ children }: { children: ReactNode }) {
  const [entry, setEntry] = useState<Entry | null>(null)
  const [isOpen, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const open = useCallback((title: string, render: Entry['render']) => {
    setEntry({ title, render })
    setOpen(true)
  }, [])

  useEffect(() => {
    document.body.classList.toggle('sheet-open', isOpen)
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen])

  const api = useMemo(() => ({ open, close, isOpen }), [open, close, isOpen])
  return (
    <Ctx.Provider value={api}>
      {children}
      <div id="scrim" onClick={close} aria-hidden="true" />
      <div id="sheet" role="dialog" aria-modal="true" aria-hidden={!isOpen} aria-label={entry?.title} inert={!isOpen}>
        {entry && (
          <>
            <div id="sheet-head">
              <h3 id="sheet-title">{entry.title}</h3>
              <button type="button" id="sheet-x" aria-label="Close" onClick={close}>✕</button>
            </div>
            <div id="sheet-body">{entry.render(close)}</div>
          </>
        )}
      </div>
    </Ctx.Provider>
  )
}

export function useSheet(): SheetApi {
  const c = useContext(Ctx)
  if (!c) throw new Error('useSheet must be used inside SheetProvider')
  return c
}

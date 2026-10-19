import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

interface ToastState {
  msg: string
  undo?: () => void
  on: boolean
}
type ToastFn = (msg: string, undo?: () => void) => void
const Ctx = createContext<ToastFn | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [t, setT] = useState<ToastState>({ msg: '', on: false })
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const toast = useCallback<ToastFn>((msg, undo) => {
    clearTimeout(timer.current)
    setT({ msg, undo, on: true })
    timer.current = setTimeout(() => setT((p) => ({ ...p, on: false })), undo ? 5000 : 2600)
  }, [])
  useEffect(() => () => clearTimeout(timer.current), [])
  const fn = useMemo(() => toast, [toast])
  return (
    <Ctx.Provider value={fn}>
      {children}
      <div id="toast" className={t.on ? `on${t.undo ? ' act' : ''}` : ''} role="status" aria-live="polite">
        {t.msg}
        {t.undo && (
          <button
            className="tundo"
            onClick={() => {
              const u = t.undo
              setT((p) => ({ ...p, on: false, undo: undefined }))
              u?.()
            }}
          >
            Undo
          </button>
        )}
      </div>
    </Ctx.Provider>
  )
}

export function useToast(): ToastFn {
  const c = useContext(Ctx)
  if (!c) throw new Error('useToast must be used inside ToastProvider')
  return c
}

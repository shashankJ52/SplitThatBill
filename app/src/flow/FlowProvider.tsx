import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { useStore } from '../data/store'
import { draftFromBill, newDraft, type Draft } from '../domain/draft'
import type { AppBill, AppLedger } from '../domain/types'
import { today, token, uid } from '../domain/util'

interface FlowApi {
  /** the split being built, or null when none is in progress */
  draft: Draft | null
  /** change the draft with a pure update function */
  set: (fn: (d: Draft) => Draft) => void
  /** start a new split, optionally pre-selecting "g:<id>" or "p:<id>" */
  begin: (want?: string | null) => void
  /** start editing a saved bill */
  edit: (bill: AppBill, ledger: AppLedger) => void
  clear: () => void
}

const Ctx = createContext<FlowApi | null>(null)

/** Holds the draft above the routes, so it survives moving between the flow's pages. */
export function FlowProvider({ children }: { children: ReactNode }) {
  const store = useStore()
  const [draft, setDraft] = useState<Draft | null>(null)
  const set = useCallback((fn: (d: Draft) => Draft) => setDraft((d) => (d ? fn(d) : d)), [])
  const begin = useCallback(
    (want?: string | null) => setDraft(newDraft(store.get(), { id: uid('b'), token: token(), date: today() }, want)),
    [store],
  )
  const edit = useCallback((bill: AppBill, ledger: AppLedger) => setDraft(draftFromBill(bill, ledger)), [])
  const clear = useCallback(() => setDraft(null), [])
  const api = useMemo(() => ({ draft, set, begin, edit, clear }), [draft, set, begin, edit, clear])
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

export function useFlow(): FlowApi {
  const c = useContext(Ctx)
  if (!c) throw new Error('useFlow must be used inside FlowProvider')
  return c
}

import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import type { AppState } from '../domain/types'
import type { Repository } from './persist'

export type SaveStatus = 'saved' | 'saving' | 'error'

export interface Store {
  get(): AppState
  /** Replace the state using a pure update function. */
  update(fn: (s: AppState) => AppState): void
  /** Swap in a whole new state (signing in or out) without saving it back. */
  replace(s: AppState): void
  /** Choose where changes are saved. Null means nowhere, such as when signed out. */
  setRepository(repo: Repository | null): void
  /** Save any waiting change now and wait for it to finish. */
  flush(): Promise<void>
  /** True while a change has not reached the repository yet. */
  dirty(): boolean
  status(): SaveStatus
  subscribe(cb: () => void): () => void
}

export function createStore(initial: AppState, initialRepo?: Repository, delay = 250): Store {
  let state = initial
  let repo: Repository | null = initialRepo ?? null
  let timer: ReturnType<typeof setTimeout> | undefined
  let dirty = false
  let status: SaveStatus = 'saved'
  let running: Promise<void> = Promise.resolve()
  const listeners = new Set<() => void>()
  const emit = () => listeners.forEach((l) => l())
  const setStatus = (x: SaveStatus) => {
    if (status !== x) {
      status = x
      emit()
    }
  }

  const persist = (): Promise<void> => {
    clearTimeout(timer)
    timer = undefined
    const r = repo
    if (!dirty || !r) {
      dirty = false
      return running
    }
    dirty = false
    const snapshot = state
    setStatus('saving')
    running = running.then(async () => {
      try {
        await r.save(snapshot)
        const stuck = (r as { pending?: () => boolean }).pending?.() ?? false
        setStatus(stuck ? 'error' : dirty ? 'saving' : 'saved')
      } catch {
        setStatus('error')
      }
    })
    return running
  }

  return {
    get: () => state,
    update(fn) {
      const next = fn(state)
      if (next === state) return
      state = next
      dirty = true
      emit()
      if (repo) {
        clearTimeout(timer)
        timer = setTimeout(() => void persist(), delay)
      }
    },
    replace(s) {
      clearTimeout(timer)
      timer = undefined
      dirty = false
      state = s
      status = 'saved'
      emit()
    },
    setRepository(r) {
      clearTimeout(timer)
      timer = undefined
      dirty = false
      repo = r
    },
    flush: () => persist(),
    dirty: () => dirty,
    status: () => status,
    subscribe(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
  }
}

const Ctx = createContext<Store | null>(null)

export function AppProvider({ store, children }: { store: Store; children: ReactNode }) {
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>
}

export function useStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore must be used inside AppProvider')
  return s
}

/** The whole app state; components derive what they need with selectors. */
export function useAppState(): AppState {
  const store = useStore()
  return useSyncExternalStore(store.subscribe, store.get)
}

export function useSaveStatus(): SaveStatus {
  const store = useStore()
  return useSyncExternalStore(store.subscribe, store.status)
}

export function useActions() {
  const store = useStore()
  return useMemo(() => ({ update: store.update, get: store.get }), [store])
}

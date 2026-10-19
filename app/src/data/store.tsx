import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import type { AppState } from '../domain/types'
import type { Repository } from './persist'

export interface Store {
  get(): AppState
  /** Replace the state using a pure update function. */
  update(fn: (s: AppState) => AppState): void
  subscribe(cb: () => void): () => void
}

export function createStore(initial: AppState, repo?: Repository, delay = 250): Store {
  let state = initial
  let timer: ReturnType<typeof setTimeout> | undefined
  const listeners = new Set<() => void>()
  return {
    get: () => state,
    update(fn) {
      const next = fn(state)
      if (next === state) return
      state = next
      listeners.forEach((l) => l())
      if (repo) {
        clearTimeout(timer)
        timer = setTimeout(() => void repo.save(state), delay)
      }
    },
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

export function useActions() {
  const store = useStore()
  return useMemo(() => ({ update: store.update, get: store.get }), [store])
}

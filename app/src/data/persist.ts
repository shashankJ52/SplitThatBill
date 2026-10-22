import { del, get, set } from 'idb-keyval'
import type { AppState } from '../domain/types'

const KEY = 'stb-state-v1'

/** Where app data is kept. Today: this browser. Later: the backend, with this as the offline cache. */
export interface Repository {
  load(): Promise<AppState | null>
  save(s: AppState): Promise<void>
  /** forget what was kept (used to reset the demo) */
  clear?(): Promise<void>
}

/** Older saved data numbered checklist items 1, 2, 3. Items now have unique string ids. */
export function withStringItemIds(s: AppState): AppState {
  const fix = <T extends { items: { id: string | number }[] }>(n: T): T => ({ ...n, items: n.items.map((x) => (typeof x.id === 'string' ? x : { ...x, id: String(x.id) })) })
  return { ...s, notes: s.notes.map(fix), ledgers: s.ledgers.map((l) => ({ ...l, lists: l.lists.map(fix) })) } as AppState
}

/** A repository that keeps one copy of the state in this browser under the given key. */
export const localKeyRepository = (key: string): Repository => ({
  async load() {
    try {
      const s = (await get(key)) as AppState | undefined
      return s && s.v === 1 ? withStringItemIds(s) : null
    } catch {
      return null
    }
  },
  async save(s) {
    try {
      await set(key, s)
    } catch {
      /* storage can be blocked or full; the app keeps working in memory */
    }
  },
  async clear() {
    try {
      await del(key)
    } catch {
      /* nothing to forget if storage is blocked */
    }
  },
})

export const localRepository = localKeyRepository(KEY)

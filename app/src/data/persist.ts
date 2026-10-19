import { get, set } from 'idb-keyval'
import type { AppState } from '../domain/types'

const KEY = 'stb-state-v1'

/** Where app data is kept. Today: this browser. Later: the backend, with this as the offline cache. */
export interface Repository {
  load(): Promise<AppState | null>
  save(s: AppState): Promise<void>
}

export const localRepository: Repository = {
  async load() {
    try {
      const s = (await get(KEY)) as AppState | undefined
      return s && s.v === 1 ? s : null
    } catch {
      return null
    }
  },
  async save(s) {
    try {
      await set(KEY, s)
    } catch {
      /* storage can be blocked or full; the app keeps working in memory */
    }
  },
}

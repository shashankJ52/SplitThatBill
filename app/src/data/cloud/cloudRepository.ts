import type { SupabaseClient } from '@supabase/supabase-js'
import type { AppState, Profile } from '../../domain/types'
import type { Repository } from '../persist'
import {
  DELETE_ORDER, UPSERT_ORDER, diff, fromLoaded, markSynced, Positions, toSnapshot,
  type DbRow, type Loaded, type Prefs, type Row, type Synced, type Table,
} from './rows'
import { emptySynced } from './rows'

/** The few database calls the sync needs. A fake version of this is used in tests. */
export interface Db {
  selectAll(table: Table): Promise<DbRow[]>
  profile(): Promise<Profile>
  prefs(): Promise<Prefs | null>
  upsert(table: Table, rows: Record<string, unknown>[]): Promise<void>
  remove(table: Table, ids: string[]): Promise<void>
  savePrefs(p: Prefs): Promise<void>
  saveProfile(p: Profile): Promise<void>
}

const PAGE = 1000
const CHUNK = 200

/** Turn a Supabase client into the Db interface for one signed-in user. */
export function supabaseDb(c: SupabaseClient, userId: string): Db {
  const fail = (e: { message: string } | null) => {
    if (e) throw new Error(e.message)
  }
  return {
    async selectAll(table) {
      const out: DbRow[] = []
      for (let from = 0; ; from += PAGE) {
        const cols = table === 'ledgers' ? 'id, kind, data' : table === 'bills' || table === 'payments' ? 'id, ledger_id, data' : 'id, data'
        const { data, error } = await c.from(table).select(cols).order('id').range(from, from + PAGE - 1)
        fail(error)
        const rows = (data ?? []) as unknown as DbRow[]
        out.push(...rows)
        if (rows.length < PAGE) return out
      }
    },
    async profile() {
      const { data, error } = await c.from('profiles').select('name, email, tag').eq('id', userId).single()
      fail(error)
      return data as Profile
    },
    async prefs() {
      const { data, error } = await c.from('prefs').select('note_order, hidden').eq('user_id', userId).maybeSingle()
      fail(error)
      return (data as Prefs | null) ?? null
    },
    async upsert(table, rows) {
      for (let i = 0; i < rows.length; i += CHUNK) {
        const { error } = await c.from(table).upsert(rows.slice(i, i + CHUNK).map((r) => ({ user_id: userId, ...r })), { onConflict: 'user_id,id' })
        fail(error)
      }
    },
    async remove(table, ids) {
      for (let i = 0; i < ids.length; i += CHUNK) {
        const { error } = await c.from(table).delete().eq('user_id', userId).in('id', ids.slice(i, i + CHUNK))
        fail(error)
      }
    },
    async savePrefs(p) {
      const { error } = await c.from('prefs').upsert({ user_id: userId, ...p }, { onConflict: 'user_id' })
      fail(error)
    },
    async saveProfile(p) {
      // the email lives with the sign-in account, so only name and tag are written here
      const { error } = await c.from('profiles').update({ name: p.name, tag: p.tag }).eq('id', userId)
      fail(error)
    },
  }
}

export interface CloudRepository extends Repository {
  /** unlike the local repository, a signed-in account always has a state to load */
  load(): Promise<AppState>
  /** true while changes are waiting to be stored */
  pending(): boolean
}

/** Stores one person's data in the database. Only what changed is sent, and a failed save is retried on the next one. */
export function createCloudRepository(db: Db): CloudRepository {
  const pos = new Positions()
  let synced: Synced = emptySynced()
  let queued: AppState | null = null
  let running: Promise<void> | null = null
  let failed = false

  async function apply(s: AppState) {
    const snap = toSnapshot(s, pos)
    const c = diff(synced, snap)
    const byTable = (rows: Row[], t: Table) => rows.filter((r) => r.table === t).map((r) => ({ id: r.id, ...r.cols }))
    for (const t of UPSERT_ORDER) {
      const rows = byTable(c.upserts, t)
      if (rows.length) await db.upsert(t, rows)
    }
    for (const t of DELETE_ORDER) {
      const ids = c.deletes.filter((d) => d.table === t).map((d) => d.id)
      if (ids.length) await db.remove(t, ids)
    }
    if (c.prefs) await db.savePrefs(c.prefs)
    if (c.profile) await db.saveProfile(c.profile)
    // only now is it safe to treat this snapshot as stored
    synced = markSynced(snap)
    for (const d of c.deletes) pos.forget(d.table, d.id)
  }

  async function drain() {
    while (queued) {
      const s = queued
      queued = null
      try {
        await apply(s)
        failed = false
      } catch (e) {
        failed = true
        console.error('Could not save to the cloud, will retry:', e instanceof Error ? e.message : e)
        if (!queued) queued = s // keep the latest state to try again with the next save
        return
      }
    }
  }

  return {
    async load() {
      const [profile, prefs, people, ledgers, bills, payments, notes, notifs, sent] = await Promise.all([
        db.profile(), db.prefs(), db.selectAll('people'), db.selectAll('ledgers'), db.selectAll('bills'),
        db.selectAll('payments'), db.selectAll('notes'), db.selectAll('notifs'), db.selectAll('sent_reminders'),
      ])
      const loaded: Loaded = { profile, prefs, people, ledgers, bills, payments, notes, notifs, sent_reminders: sent }
      const state = fromLoaded(loaded, pos)
      synced = markSynced(toSnapshot(state, pos))
      return state
    },
    async save(s) {
      queued = s
      if (!running) {
        running = drain().finally(() => {
          running = null
        })
      }
      await running
    },
    pending: () => queued !== null || failed,
  }
}

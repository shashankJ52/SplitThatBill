import type { SupabaseClient } from '@supabase/supabase-js'
import type { AppState, Profile } from '../../domain/types'
import type { Repository } from '../persist'
import {
  DELETE_ORDER, UPDATE_COLS, WRITE_ORDER, diff, emptySynced, fromLoaded, markSynced, Positions, toSnapshot,
  type Loaded, type Prefs, type Row, type Synced, type WriteTable,
} from './rows'

/** The few database calls the sync needs. A fake or a local-Postgres version of this is used in tests. */
export interface Db {
  userId: string
  loadAll(): Promise<Loaded>
  /** Add rows. Rows that already exist are left alone, so a retry after a half-finished save is safe. */
  insert(table: WriteTable, rows: Record<string, unknown>[]): Promise<void>
  /** Add rows or change existing ones. */
  upsert(table: WriteTable, rows: Record<string, unknown>[]): Promise<void>
  /** Change one row by id (members use "groupId:personId"). */
  update(table: WriteTable, id: string, cols: Record<string, unknown>): Promise<void>
  remove(table: WriteTable, ids: string[]): Promise<void>
  /** Take a contact out of a group (members are never deleted, so history keeps names). */
  removeMember(groupId: string, personId: string): Promise<void>
  savePrefs(p: Prefs): Promise<void>
  saveProfile(p: Profile): Promise<void>
}

/** A refusal the database will always repeat (not allowed, bad data), as opposed to a network hiccup. */
export class DbError extends Error {
  readonly code: string
  constructor(message: string, code: string) {
    super(message)
    this.code = code
  }
  get permanent() {
    return /^(22|23|42|P0|PGRST)/.test(this.code)
  }
}

const CHUNK = 200
const PAGE = 1000

/**
 * What to read from each table and in which order (needed for paging). Shared by the real database adapter and the
 * one used in tests, so the tests run the very same queries.
 */
export const LOAD_SPECS = {
  groups: { cols: ['id', 'kind', 'name', 'color', 'simplify', 'currency', 'owner_id', 'invite_code', 'created_at'], order: ['id'] },
  members: { cols: ['group_id', 'person_id', 'user_id', 'display_name', 'role', 'status', 'created_at', 'joined_at'], order: ['group_id', 'person_id'] },
  profiles: { cols: ['id', 'name', 'tag'], order: ['id'] },
  join_requests: { cols: ['group_id', 'user_id', 'created_at'], order: ['group_id', 'user_id'], where: { status: 'pending' } },
  bills: { cols: ['id', 'group_id', 'created_by', 'bill_date', 'token', 'data', 'created_at'], order: ['id'] },
  comments: { cols: ['id', 'group_id', 'bill_id', 'author_id', 'text', 'sys', 'created_at'], order: ['id'] },
  payments: { cols: ['id', 'group_id', 'created_by', 'pay_date', 'data', 'created_at'], order: ['id'] },
  lists: { cols: ['id', 'group_id', 'title', 'memo', 'created_at', 'updated_at'], order: ['id'] },
  list_items: { cols: ['id', 'group_id', 'list_id', 'text', 'done', 'done_by', 'position', 'created_at'], order: ['id'] },
  notes: { cols: ['id', 'data'], order: ['id'] },
  notifs: { cols: ['id', 'data', 'created_at'], order: ['id'] },
  sent_reminders: { cols: ['id', 'data'], order: ['id'] },
} as const
export type LoadTable = keyof typeof LOAD_SPECS

/** Turn a Supabase client into the Db interface for one signed-in user. */
export function supabaseDb(c: SupabaseClient, userId: string): Db {
  const fail = (e: { message: string; code?: string } | null) => {
    if (e) throw new DbError(e.message, e.code ?? '')
  }
  const all = async <T,>(table: LoadTable): Promise<T[]> => {
    const spec: { cols: readonly string[]; order: readonly string[]; where?: Record<string, string> } = LOAD_SPECS[table]
    const out: T[] = []
    for (let from = 0; ; from += PAGE) {
      let q = c.from(table).select(spec.cols.join(', '))
      for (const [k, v] of Object.entries(spec.where ?? {})) q = q.eq(k, v)
      for (const col of spec.order) q = q.order(col)
      const { data, error } = await q.range(from, from + PAGE - 1)
      fail(error)
      const rows = (data ?? []) as unknown as T[]
      out.push(...rows)
      if (rows.length < PAGE) return out
    }
  }
  const chunks = <T,>(rows: T[]) => Array.from({ length: Math.ceil(rows.length / CHUNK) }, (_, i) => rows.slice(i * CHUNK, (i + 1) * CHUNK))
  // members are keyed by group and person, personal notes by owner and id, everything else by id
  const key = (t: WriteTable) => (t === 'members' ? 'group_id,person_id' : t === 'notes' ? 'user_id,id' : 'id')
  const own = (t: WriteTable, rows: Record<string, unknown>[]) => (t === 'notes' ? rows.map((r) => ({ user_id: userId, ...r })) : rows)

  return {
    userId,
    async loadAll() {
      const [profile, prefs, groups, members, profiles, requests, bills, comments, payments, lists, listItems, notes, notifs, sent] = await Promise.all([
        c.from('profiles').select('name, email, tag').eq('id', userId).single(),
        c.from('prefs').select('note_order, hidden, layout').eq('user_id', userId).maybeSingle(),
        all<Loaded['groups'][number]>('groups'),
        all<Loaded['members'][number]>('members'),
        all<Loaded['profiles'][number]>('profiles'),
        all<Loaded['requests'][number]>('join_requests'),
        all<Loaded['bills'][number]>('bills'),
        all<Loaded['comments'][number]>('comments'),
        all<Loaded['payments'][number]>('payments'),
        all<Loaded['lists'][number]>('lists'),
        all<Loaded['listItems'][number]>('list_items'),
        all<Loaded['notes']>('notes'),
        all<Loaded['notifs']>('notifs'),
        all<Loaded['sent']>('sent_reminders'),
      ])
      fail(profile.error)
      fail(prefs.error)
      return {
        userId,
        profile: profile.data as Profile,
        prefs: (prefs.data as Prefs | null) ?? null,
        groups, members, profiles, requests, bills, comments, payments, lists, listItems,
        notes: notes as unknown as Loaded['notes'], notifs: notifs as unknown as Loaded['notifs'], sent: sent as unknown as Loaded['sent'],
      }
    },
    async insert(table, rows) {
      for (const part of chunks(own(table, rows))) fail((await c.from(table).upsert(part, { onConflict: key(table), ignoreDuplicates: true })).error)
    },
    async upsert(table, rows) {
      for (const part of chunks(own(table, rows))) fail((await c.from(table).upsert(part, { onConflict: key(table) })).error)
    },
    async update(table, id, cols) {
      let q = c.from(table).update(cols)
      if (table === 'members') {
        const [g, p] = id.split(':')
        q = q.eq('group_id', g).eq('person_id', p)
      } else q = q.eq('id', id)
      fail((await q).error)
    },
    async remove(table, ids) {
      for (const part of chunks(ids)) fail((await c.from(table).delete().in('id', part)).error)
    },
    async removeMember(groupId, personId) {
      fail((await c.rpc('remove_member', { gid: groupId, pid: personId })).error)
    },
    async savePrefs(p) {
      fail((await c.from('prefs').upsert({ user_id: userId, ...p }, { onConflict: 'user_id' })).error)
    },
    async saveProfile(p) {
      // the email lives with the sign-in account, so only name and tag are written here
      fail((await c.from('profiles').update({ name: p.name, tag: p.tag }).eq('id', userId)).error)
    },
  }
}

export interface CloudRepository extends Repository {
  /** unlike the local repository, a signed-in account always has a state to load */
  load(): Promise<AppState>
  /** true while changes are waiting to be stored */
  pending(): boolean
}

/**
 * Stores one person's data in the database. Only what changed is sent. A network failure is retried by the next save.
 * A refusal (for example an edit the person is not allowed to make) is dropped, and `onRejected` is called so the
 * screen can be refreshed back to what the database really holds.
 */
export function createCloudRepository(db: Db, onRejected?: () => void): CloudRepository {
  const pos = new Positions()
  let synced: Synced = emptySynced()
  let queued: AppState | null = null
  let running: Promise<void> | null = null
  let failed = false

  async function apply(s: AppState) {
    const snap = toSnapshot(s, db.userId, pos)
    const c = diff(synced, snap)
    let rejected = 0
    /** Run one write. Refusals are counted and skipped; network problems stop the save so it can be retried. */
    const run = async (fn: () => Promise<void>) => {
      try {
        await fn()
      } catch (e) {
        if (e instanceof DbError && e.permanent) {
          rejected++
          console.warn('The database refused a change:', e.message)
        } else throw e
      }
    }
    const rowsOf = (list: Row[], t: WriteTable) => list.filter((r) => r.table === t)
    const withId = (r: Row) => ({ ...(r.table === 'members' ? {} : { id: r.id }), ...r.cols })

    for (const t of WRITE_ORDER) {
      const ins = rowsOf(c.inserts, t)
      if (ins.length) await run(() => db.insert(t, ins.map(withId)))
      const ups = rowsOf(c.upserts, t)
      if (ups.length) await run(() => db.upsert(t, ups.map(withId)))
      for (const r of rowsOf(c.updates, t)) {
        const allowed = UPDATE_COLS[t] ?? []
        await run(() => db.update(t, r.id, Object.fromEntries(Object.entries(r.cols).filter(([k]) => allowed.includes(k)))))
      }
    }
    for (const t of DELETE_ORDER) {
      const ids = c.deletes.filter((d) => d.table === t).map((d) => d.id)
      if (ids.length) await run(() => db.remove(t, ids))
    }
    for (const m of c.removedContacts) await run(() => db.removeMember(m.groupId, m.personId))
    if (c.prefs) await run(() => db.savePrefs(c.prefs as Prefs))
    if (c.profile) await run(() => db.saveProfile(c.profile as Profile))
    // every write either worked or was refused for good, so this snapshot is now settled
    synced = markSynced(snap)
    if (rejected) onRejected?.()
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
      const state = fromLoaded(await db.loadAll(), pos)
      synced = markSynced(toSnapshot(state, db.userId, pos))
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

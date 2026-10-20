import { DbError, type Db } from '../data/cloud/cloudRepository.ts'
import type { Loaded, WriteTable } from '../data/cloud/rows.ts'
import type { TestDb } from './harness.ts'

const ISO = (c: string) => `to_char(${c} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as ${c}`

/** The sync's database interface, run for one signed-in person against the real migrations in a local Postgres. */
export function pgliteDb(t: TestDb, userId: string): Db {
  /** Run a statement as this person, turning database errors into the sync's own error type. */
  const q = async (text: string, params: unknown[] = []) => {
    try {
      return await t.as(userId, () => t.sql(text, params))
    } catch (e) {
      const err = e as { message?: string; code?: string }
      throw new DbError(err.message ?? String(e), err.code ?? '')
    }
  }
  const conflictKey = (table: WriteTable) => (table === 'members' ? ['group_id', 'person_id'] : table === 'notes' ? ['user_id', 'id'] : ['id'])
  const val = (v: unknown) => (v !== null && typeof v === 'object' ? JSON.stringify(v) : v)

  async function write(table: WriteTable, rows: Record<string, unknown>[], merge: boolean) {
    for (const row of rows) {
      const r = table === 'notes' ? { user_id: userId, ...row } : row
      const cols = Object.keys(r)
      const key = conflictKey(table)
      const set = cols.filter((c) => !key.includes(c)).map((c) => `${c} = excluded.${c}`).join(', ')
      const sql = `insert into ${table} (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')}) on conflict (${key.join(', ')}) ${merge && set ? `do update set ${set}` : 'do nothing'}`
      await q(sql, cols.map((c) => val(r[c])))
    }
  }

  return {
    userId,
    async loadAll() {
      const sel = (sql: string) => q(sql)
      const [profile, prefs, groups, members, profiles, requests, bills, comments, payments, lists, listItems, notes, notifs, sent] = await Promise.all([
        sel(`select name, email, tag from profiles where id = '${userId}'`),
        sel(`select note_order, hidden from prefs`),
        sel(`select id, kind, name, color, simplify, owner_id, invite_code, ${ISO('created_at')} from groups`),
        sel(`select group_id, person_id, user_id, display_name, role, status, ${ISO('created_at')}, ${ISO('joined_at')} from members`),
        sel(`select id, name, tag from profiles`),
        sel(`select group_id, user_id, ${ISO('created_at')} from join_requests where status = 'pending'`),
        sel(`select id, group_id, created_by, bill_date::text as bill_date, token, data, ${ISO('created_at')} from bills`),
        sel(`select id, group_id, bill_id, author_id, text, sys, ${ISO('created_at')} from comments`),
        sel(`select id, group_id, created_by, pay_date::text as pay_date, data, ${ISO('created_at')} from payments`),
        sel(`select id, group_id, title, memo, ${ISO('created_at')}, ${ISO('updated_at')} from lists`),
        sel(`select id, group_id, list_id, text, done, done_by, position, ${ISO('created_at')} from list_items`),
        sel(`select id, data from notes`),
        sel(`select id, data, ${ISO('created_at')} from notifs`),
        sel(`select id, data from sent_reminders`),
      ])
      return {
        userId,
        profile: profile[0] as unknown as Loaded['profile'],
        prefs: (prefs[0] as unknown as Loaded['prefs']) ?? null,
        groups, members, profiles, requests, bills, comments, payments, lists, listItems, notes, notifs, sent,
      } as unknown as Loaded
    },
    insert: (table, rows) => write(table, rows, false),
    upsert: (table, rows) => write(table, rows, true),
    async update(table, id, cols) {
      const keys = Object.keys(cols)
      const set = keys.map((c, i) => `${c} = $${i + 1}`).join(', ')
      const params = keys.map((c) => val(cols[c]))
      if (table === 'members') {
        const [g, p] = id.split(':')
        await q(`update members set ${set} where group_id = $${keys.length + 1} and person_id = $${keys.length + 2}`, [...params, g, p])
      } else await q(`update ${table} set ${set} where id = $${keys.length + 1}`, [...params, id])
    },
    async remove(table, ids) {
      await q(`delete from ${table} where id::text = any($1::text[])`, [ids])
    },
    async removeMember(groupId, personId) {
      await q(`select remove_member($1, $2)`, [groupId, personId])
    },
    async savePrefs(p) {
      await q(`insert into prefs (user_id, note_order, hidden) values ($1, $2, $3) on conflict (user_id) do update set note_order = excluded.note_order, hidden = excluded.hidden`, [userId, JSON.stringify(p.note_order), JSON.stringify(p.hidden)])
    },
    async saveProfile(p) {
      await q(`update profiles set name = $1, tag = $2 where id = $3`, [p.name, p.tag, userId])
    },
  }
}

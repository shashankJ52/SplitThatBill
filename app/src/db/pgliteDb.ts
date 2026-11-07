import { DbError, LOAD_SPECS, type Db, type LoadTable } from '../data/cloud/cloudRepository.ts'
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

  /** Like the real API: one statement for the whole batch, every row with the same columns, a missing value becomes NULL. */
  async function write(table: WriteTable, rows: Record<string, unknown>[], merge: boolean) {
    if (!rows.length) return
    const all = rows.map((row) => (table === 'notes' ? { user_id: userId, ...row } : row))
    const cols = [...new Set(all.flatMap((r) => Object.keys(r)))]
    const key = conflictKey(table)
    const set = cols.filter((c) => !key.includes(c)).map((c) => `${c} = excluded.${c}`).join(', ')
    const params: unknown[] = []
    const values = all.map((r) => `(${cols.map((c) => { params.push(val(r[c] ?? null)); return `$${params.length}` }).join(', ')})`).join(', ')
    await q(`insert into ${table} (${cols.join(', ')}) values ${values} on conflict (${key.join(', ')}) ${merge && set ? `do update set ${set}` : 'do nothing'}`, params)
  }

  return {
    userId,
    async loadAll() {
      /** Read one table with the same columns and order the real adapter uses. */
      const read = (table: LoadTable) => {
        const spec: { cols: readonly string[]; order: readonly string[]; where?: Record<string, string> } = LOAD_SPECS[table]
        const col = (c: string) =>
          c === 'created_at' || c === 'updated_at' || c === 'joined_at' ? ISO(c) : c === 'bill_date' || c === 'pay_date' ? `${c}::text as ${c}` : c
        const where = Object.entries(spec.where ?? {}).map(([k, v]) => `${k} = '${v}'`).join(' and ')
        return q(`select ${spec.cols.map(col).join(', ')} from ${table}${where ? ` where ${where}` : ''} order by ${spec.order.join(', ')}`)
      }
      const [profile, prefs, groups, members, profiles, requests, bills, comments, payments, lists, listItems, notes, notifs, sent] = await Promise.all([
        q(`select name, tag from profiles where id = '${userId}'`),
        q(`select note_order, hidden, layout from prefs`),
        read('groups'), read('members'), read('profiles'), read('join_requests'), read('bills'), read('comments'), read('payments'),
        read('lists'), read('list_items'), read('notes'), read('notifs'), read('sent_reminders'),
      ])
      return {
        userId,
        profile: { ...(profile[0] as object), email: (await t.admin(() => t.sql('select email from auth.users where id = $1', [userId])))[0]?.email ?? '' } as unknown as Loaded['profile'],
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
      await q(`insert into prefs (user_id, note_order, hidden, layout) values ($1, $2, $3, $4) on conflict (user_id) do update set note_order = excluded.note_order, hidden = excluded.hidden, layout = excluded.layout`, [userId, JSON.stringify(p.note_order), JSON.stringify(p.hidden), JSON.stringify(p.layout)])
    },
    async saveProfile(p) {
      await q(`update profiles set name = $1, tag = $2 where id = $3`, [p.name, p.tag, userId])
    },
  }
}

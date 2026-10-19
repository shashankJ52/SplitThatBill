import { describe, expect, it } from 'vitest'
import { seedState } from '../../domain/seed'
import type { Profile } from '../../domain/types'
import { createCloudRepository, type Db } from './cloudRepository'
import type { DbRow, Prefs, Table } from './rows'

/** A pretend database that remembers what was written, so tests can read it back. */
function fakeDb(profile: Profile) {
  const tables = new Map<Table, Map<string, Record<string, unknown>>>()
  const calls: string[] = []
  let prefs: Prefs | null = null
  let prof = profile
  let failNext = 0
  const t = (n: Table) => tables.get(n) ?? tables.set(n, new Map()).get(n)!
  const db: Db = {
    async selectAll(table) {
      return [...t(table).values()].map((r) => ({ id: r.id as string, kind: r.kind as string | undefined, ledger_id: r.ledger_id as string | undefined, data: JSON.parse(JSON.stringify(r.data)) })) as DbRow[]
    },
    async profile() { return prof },
    async prefs() { return prefs },
    async upsert(table, rows) {
      if (failNext > 0) { failNext--; throw new Error('network down') }
      calls.push(`upsert ${table} ${rows.length}`)
      rows.forEach((r) => t(table).set(r.id as string, JSON.parse(JSON.stringify(r))))
    },
    async remove(table, ids) {
      calls.push(`remove ${table} ${ids.length}`)
      ids.forEach((id) => t(table).delete(id))
    },
    async savePrefs(p) { prefs = p; calls.push('prefs') },
    async saveProfile(p) { prof = p; calls.push('profile') },
  }
  return { db, calls, tables, fail: (n = 1) => (failNext = n) }
}

const now = Date.UTC(2026, 9, 19, 12)

describe('cloud repository', () => {
  it('a new account loads empty and sends nothing until something changes', async () => {
    const f = fakeDb({ name: 'Alex', email: 'a@b.co', tag: 'alex' })
    const repo = createCloudRepository(f.db)
    const s = await repo.load()
    expect(s.ledgers).toEqual([])
    expect(s.profile.tag).toBe('alex')
    await repo.save(s)
    expect(f.calls).toEqual([])
  })

  it('saves the sample story and loads it back identically (what a second device would see)', async () => {
    const f = fakeDb({ name: 'Shashank J.', email: 'you@example.com', tag: 'shashank' })
    const a = createCloudRepository(f.db)
    await a.load()
    const story = seedState(now)
    await a.save(story)
    const b = createCloudRepository(f.db)
    const loaded = await b.load()
    expect({ ...loaded, password: story.password }).toEqual({ ...story, profile: loaded.profile })
  })

  it('sends only what changed afterwards', async () => {
    const f = fakeDb({ name: 'Shashank J.', email: 'you@example.com', tag: 'shashank' })
    const repo = createCloudRepository(f.db)
    await repo.load()
    const story = seedState(now)
    await repo.save(story)
    f.calls.length = 0
    const l = story.ledgers[0]
    await repo.save({ ...story, ledgers: [{ ...l, bills: l.bills.map((b, i) => (i === 0 ? { ...b, notes: 'x' } : b)) }, ...story.ledgers.slice(1)] })
    expect(f.calls).toEqual(['upsert bills 1'])
  })

  it('deletes bills before their ledger', async () => {
    const f = fakeDb({ name: 'S', email: 'e@x.co', tag: 'shashank' })
    const repo = createCloudRepository(f.db)
    await repo.load()
    const story = seedState(now)
    await repo.save(story)
    f.calls.length = 0
    await repo.save({ ...story, ledgers: story.ledgers.slice(1) })
    const order = f.calls.map((c) => c.split(' ')[1])
    expect(order.indexOf('bills')).toBeLessThan(order.indexOf('ledgers'))
  })

  it('retries after a failed save without losing the change', async () => {
    const f = fakeDb({ name: 'S', email: 'e@x.co', tag: 'shashank' })
    const repo = createCloudRepository(f.db)
    await repo.load()
    const story = seedState(now)
    f.fail(1)
    await repo.save(story)
    expect(repo.pending()).toBe(true)
    expect(f.tables.get('ledgers')?.size ?? 0).toBe(0)
    await repo.save(story) // the next save sends everything that is still missing
    expect(repo.pending()).toBe(false)
    expect(f.tables.get('ledgers')?.size).toBe(story.ledgers.length)
  })

  it('later saves during a running one are not lost', async () => {
    const f = fakeDb({ name: 'S', email: 'e@x.co', tag: 'shashank' })
    const repo = createCloudRepository(f.db)
    await repo.load()
    const story = seedState(now)
    const p1 = repo.save({ ...story, notes: [] })
    const p2 = repo.save(story)
    await Promise.all([p1, p2])
    expect(f.tables.get('notes')?.size).toBe(story.notes.length)
  })
})

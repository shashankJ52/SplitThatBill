import { describe, expect, it, vi } from 'vitest'
import { emptyState } from '../../domain/seed'
import { ME } from '../../domain/types'
import { uid } from '../../domain/util'
import { createCloudRepository, DbError, type Db } from './cloudRepository'
import type { Loaded } from './rows'

const USER = '11111111-1111-4111-8111-111111111111'
const empty: Loaded = {
  userId: USER, profile: { name: 'Ann', email: 'a@b.co', tag: 'ann' }, prefs: null, groups: [], members: [], profiles: [], requests: [],
  bills: [], comments: [], payments: [], lists: [], listItems: [], notes: [], notifs: [], sent: [],
}

/** A pretend database that records what it was asked and can be told to fail. */
function fake(failWith?: () => Error | null) {
  const calls: string[] = []
  const hit = (name: string) => {
    const e = failWith?.()
    if (e) throw e
    calls.push(name)
  }
  const db: Db = {
    userId: USER,
    loadAll: async () => empty,
    insert: async (t, rows) => hit(`insert ${t} ${rows.length}`),
    upsert: async (t, rows) => hit(`upsert ${t} ${rows.length}`),
    update: async (t) => hit(`update ${t}`),
    remove: async (t, ids) => hit(`remove ${t} ${ids.length}`),
    removeMember: async () => hit('removeMember'),
    savePrefs: async () => hit('prefs'),
    saveProfile: async () => hit('profile'),
  }
  return { db, calls }
}
const withGroup = () => {
  const s = emptyState(empty.profile, '')
  return { ...s, signedIn: true, ledgers: [{ id: uid(), kind: 'group' as const, name: 'Flat', color: '#0039A6', simplify: true, members: [ME], bills: [], payments: [], lists: [] }] }
}

describe('cloud repository', () => {
  it('a new account loads empty and sends nothing until something changes', async () => {
    const f = fake()
    const repo = createCloudRepository(f.db)
    const s = await repo.load()
    expect(s.ledgers).toEqual([])
    await repo.save(s)
    expect(f.calls).toEqual([])
  })

  it('writes parents before children and sends only what changed afterwards', async () => {
    const f = fake()
    const repo = createCloudRepository(f.db)
    await repo.load()
    const s = withGroup()
    await repo.save(s)
    expect(f.calls).toEqual(['insert groups 1', 'insert members 1'])
    f.calls.length = 0
    await repo.save({ ...s, ledgers: [{ ...s.ledgers[0], name: 'Renamed' }] })
    expect(f.calls).toEqual(['update groups'])
  })

  it('a network failure keeps the change and the next save retries it', async () => {
    let down = true
    const f = fake(() => (down ? new Error('Failed to fetch') : null))
    const repo = createCloudRepository(f.db)
    await repo.load()
    const s = withGroup()
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await repo.save(s)
    expect(repo.pending()).toBe(true)
    expect(f.calls).toEqual([])
    down = false
    await repo.save(s)
    expect(repo.pending()).toBe(false)
    expect(f.calls).toEqual(['insert groups 1', 'insert members 1'])
    err.mockRestore()
  })

  it('a refusal is dropped for good (no retry loop) and the screen is told to refresh', async () => {
    const refused = new DbError('new row violates row-level security policy', '42501')
    const f = fake(() => refused)
    const onRejected = vi.fn()
    const repo = createCloudRepository(f.db, onRejected)
    await repo.load()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await repo.save(withGroup())
    expect(repo.pending()).toBe(false)
    expect(onRejected).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('a save requested while another is running is not lost', async () => {
    const f = fake()
    const repo = createCloudRepository(f.db)
    await repo.load()
    const s = withGroup()
    const first = repo.save({ ...s, ledgers: [] })
    const second = repo.save(s)
    await Promise.all([first, second])
    expect(f.calls).toContain('insert groups 1')
  })

  it('classifies database errors', () => {
    expect(new DbError('x', '42501').permanent).toBe(true)
    expect(new DbError('x', '23505').permanent).toBe(true)
    expect(new DbError('x', 'P0001').permanent).toBe(true)
    expect(new DbError('x', 'PGRST301').permanent).toBe(true)
    expect(new DbError('x', '').permanent).toBe(false)
    expect(new DbError('x', '08006').permanent).toBe(false)
  })
})

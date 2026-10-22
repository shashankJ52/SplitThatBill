import { describe, expect, it } from 'vitest'
import { feedbackShare, isAdmin, loadAdmin, NOT_ADMIN, setDisabled, since, type AdminClient } from './api'

const client = (replies: Record<string, { data?: unknown; error?: string }>) => {
  const calls: { name: string; args?: Record<string, unknown> }[] = []
  const c: AdminClient = {
    rpc: async (name, args) => {
      calls.push({ name, args })
      const r = replies[name] ?? {}
      return { data: r.data ?? null, error: r.error ? { message: r.error } : null }
    },
  }
  return { c, calls }
}

describe('loading the dashboard', () => {
  it('asks for the numbers, the inbox and the people together', async () => {
    const ov = { at: 'now', users: { total: 1 } }
    const { c, calls } = client({ admin_overview: { data: ov }, admin_feedback: { data: [{ id: 'f1' }] }, admin_users: { data: [{ id: 'u1' }, { id: 'u2' }] } })
    const d = await loadAdmin(c)
    expect(d.overview).toBe(ov)
    expect(d.feedback).toHaveLength(1)
    expect(d.users).toHaveLength(2)
    expect(calls.map((x) => x.name).sort()).toEqual(['admin_feedback', 'admin_overview', 'admin_users'])
  })
  it('passes on a refusal from the database', async () => {
    const { c } = client({ admin_overview: { error: 'Admins only' }, admin_feedback: { error: 'Admins only' }, admin_users: { error: 'Admins only' } })
    await expect(loadAdmin(c)).rejects.toThrow(NOT_ADMIN)
  })
  it('treats empty lists as empty', async () => {
    const { c } = client({ admin_overview: { data: {} } })
    expect(await loadAdmin(c)).toMatchObject({ feedback: [], users: [] })
  })
})

describe('isAdmin', () => {
  it('is true only when the database says so', async () => {
    expect(await isAdmin(client({ is_admin: { data: true } }).c)).toBe(true)
    expect(await isAdmin(client({ is_admin: { data: false } }).c)).toBe(false)
    expect(await isAdmin(client({ is_admin: { error: 'permission denied' } }).c)).toBe(false)
  })
})

describe('switching someone off', () => {
  it('sends who and which way, and reports a refusal', async () => {
    const ok = client({})
    expect(await setDisabled(ok.c, 'u1', true)).toEqual({})
    expect(ok.calls).toEqual([{ name: 'admin_set_disabled', args: { target: 'u1', off: true } }])
    expect(await setDisabled(client({ admin_set_disabled: { error: 'You cannot disable your own account' } }).c, 'me', true)).toEqual({ err: 'You cannot disable your own account' })
  })
})

describe('feedbackShare', () => {
  it('gives whole percentages that add up to 100', () => {
    for (const f of [{ total: 3, down: 1, up: 1, love: 1 }, { total: 7, down: 2, up: 2, love: 3 }, { total: 1, down: 0, up: 0, love: 1 }, { total: 9, down: 4, up: 4, love: 1 }]) {
      const s = feedbackShare(f)
      expect(s.down + s.up + s.love).toBe(100)
    }
    expect(feedbackShare({ total: 4, down: 1, up: 1, love: 2 })).toEqual({ down: 25, up: 25, love: 50 })
  })
  it('is all zero with no feedback', () => {
    expect(feedbackShare({ total: 0, down: 0, up: 0, love: 0 })).toEqual({ down: 0, up: 0, love: 0 })
  })
})

describe('since', () => {
  const now = Date.parse('2026-10-22T12:00:00Z')
  it('reads naturally', () => {
    expect(since(null, now)).toBe('never')
    expect(since('2026-10-22T11:59:40Z', now)).toBe('just now')
    expect(since('2026-10-22T11:30:00Z', now)).toBe('30 min ago')
    expect(since('2026-10-22T09:00:00Z', now)).toBe('3 h ago')
    expect(since('2026-10-21T11:00:00Z', now)).toBe('1 day ago')
    expect(since('2026-10-12T12:00:00Z', now)).toBe('10 days ago')
  })
})

import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, type TestDb } from './harness.ts'

let t: TestDb
let ann: string
let ben: string

beforeEach(async () => {
  t = await createTestDb()
  ann = await t.signUp('Ann Lee', 'ann')
  ben = await t.signUp('Ben Ray', 'ben')
}, 60_000)

type Credit = { ok: boolean; used: number; limit: number; resets_at: string }
const take = (who: string) => t.as(who, async () => (await t.sql('select take_scan_credit() as c'))[0].c as Credit)

describe('the daily scan limit', () => {
  it('allows 20 scans a day, then refuses the 21st with the time it resets', async () => {
    for (let i = 1; i <= 20; i++) expect(await take(ann)).toMatchObject({ ok: true, used: i, limit: 20 })
    const blocked = await take(ann)
    expect(blocked).toMatchObject({ ok: false, used: 20, limit: 20 })
    // it resets at the next midnight UTC
    const reset = new Date(blocked.resets_at)
    expect(reset.getUTCHours()).toBe(0)
    expect(reset.getUTCMinutes()).toBe(0)
    expect(reset.getTime()).toBeGreaterThan(Date.now())
    expect(reset.getTime() - Date.now()).toBeLessThanOrEqual(24 * 3600 * 1000)
  })

  it('counts each person separately', async () => {
    for (let i = 0; i < 20; i++) await take(ann)
    expect((await take(ann)).ok).toBe(false)
    expect(await take(ben)).toMatchObject({ ok: true, used: 1 })
  })

  it('starts a fresh count on a new day', async () => {
    for (let i = 0; i < 20; i++) await take(ann)
    await t.sql(`update public.scan_usage set day = day - 1 where user_id = $1`, [ann])
    expect(await take(ann)).toMatchObject({ ok: true, used: 1 })
  })

  it('gives a scan back when the reading service fails, but never below zero', async () => {
    await take(ann)
    await take(ann)
    await t.as(ann, () => t.sql('select refund_scan_credit()'))
    expect(await take(ann)).toMatchObject({ ok: true, used: 2 })
    await t.sql(`update public.scan_usage set n = 0`)
    await t.as(ann, () => t.sql('select refund_scan_credit()'))
    expect((await t.sql('select n from public.scan_usage where user_id = $1', [ann]))[0].n).toBe(0)
  })

  it('is closed to signed-out visitors, and the counter table cannot be read or changed directly', async () => {
    await expect(t.anon(() => t.sql('select take_scan_credit()'))).rejects.toThrow()
    await take(ann)
    await expect(t.as(ann, () => t.sql('select * from public.scan_usage'))).rejects.toThrow()
    await expect(t.as(ann, () => t.sql('update public.scan_usage set n = 0'))).rejects.toThrow()
    await expect(t.as(ann, () => t.sql('insert into public.scan_usage (user_id, day, n) values ($1, current_date + 5, 0)', [ann]))).rejects.toThrow()
  })
})

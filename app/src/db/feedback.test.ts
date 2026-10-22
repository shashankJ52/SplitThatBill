import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, type TestDb } from './harness.ts'

let t: TestDb
let ann: string

beforeEach(async () => {
  t = await createTestDb()
  ann = await t.signUp('Ann Lee', 'ann')
}, 60_000)

const send = (rating: string, message = 'hello', contact = '', ip = '203.0.113.7') =>
  t.sql(`select set_config('request.headers', $1, false)`, [JSON.stringify({ 'x-forwarded-for': `${ip}, 10.0.0.1` })]).then(() => t.sql('select submit_feedback($1, $2, $3, $4, $5)', [rating, message, contact, '/home', 'iPhone']))
const rows = () => t.sql('select * from public.feedback order by created_at')

describe('sending feedback', () => {
  it('works for someone signed out, and records no person', async () => {
    await t.anon(() => send('love', '  Great app  ', 'me@example.com'))
    const r = await rows()
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ rating: 'love', message: 'Great app', contact: 'me@example.com', page: '/home', device: 'iPhone', user_id: null })
  })

  it('records who sent it when they are signed in', async () => {
    await t.as(ann, () => send('down', 'The button is hard to find'))
    expect((await rows())[0]).toMatchObject({ rating: 'down', user_id: ann })
  })

  it('takes all three ratings and nothing else', async () => {
    for (const r of ['down', 'up', 'love']) await t.anon(() => send(r, r, '', `198.51.100.${r.length}`))
    expect((await rows()).map((x) => x.rating).sort()).toEqual(['down', 'love', 'up'])
    await expect(t.anon(() => send('amazing'))).rejects.toThrow(/Choose how you feel/)
    await expect(t.anon(() => t.sql('select submit_feedback(null, $1, $2, $3, $4)', ['x', '', '', '']))).rejects.toThrow(/Choose how you feel/)
  })

  it('cuts overlong text instead of failing, and allows a rating alone', async () => {
    await t.anon(() => send('up', 'x'.repeat(5000), 'y'.repeat(500)))
    const r = (await rows())[0]
    expect((r.message as string).length).toBe(2000)
    expect((r.contact as string).length).toBe(200)
    await t.anon(() => send('up', '', '', '198.51.100.9'))
    expect(await rows()).toHaveLength(2)
  })

  it('slows a signed-out flood from one address, but not other addresses', async () => {
    for (let i = 0; i < 5; i++) await t.anon(() => send('up', `n${i}`, '', '192.0.2.10'))
    await expect(t.anon(() => send('up', 'one too many', '', '192.0.2.10'))).rejects.toThrow(/wait a little/)
    await t.anon(() => send('up', 'someone else', '', '192.0.2.11'))
    expect(await rows()).toHaveLength(6)
  })

  it('allows a signed-in person 10 a day', async () => {
    for (let i = 0; i < 10; i++) await t.as(ann, () => send('up', `n${i}`))
    await expect(t.as(ann, () => send('up', 'eleventh'))).rejects.toThrow(/tomorrow/)
    // a day later they can write again
    await t.sql(`update public.feedback set created_at = created_at - interval '2 days'`)
    await t.as(ann, () => send('up', 'back again'))
  })

  it('cannot be read or written directly by anyone using the app', async () => {
    await t.anon(() => send('up'))
    await expect(t.anon(() => t.sql('select * from public.feedback'))).rejects.toThrow()
    await expect(t.as(ann, () => t.sql('select * from public.feedback'))).rejects.toThrow()
    await expect(t.as(ann, () => t.sql(`insert into public.feedback (rating) values ('up')`))).rejects.toThrow()
    await expect(t.as(ann, () => t.sql('delete from public.feedback'))).rejects.toThrow()
  })

  it('keeps the feedback when the sender deletes their account', async () => {
    await t.as(ann, () => send('love', 'I enjoyed it'))
    await t.as(ann, () => t.sql('select delete_my_account()'))
    const r = await rows()
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ message: 'I enjoyed it', user_id: null })
  })
})

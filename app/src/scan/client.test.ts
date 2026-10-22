import { describe, expect, it } from 'vitest'
import { fitWithin, limitMessage, scanReceipt, ScanError } from './client'

const reply = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch

describe('fitWithin', () => {
  it('shrinks the long side to the limit and keeps the shape', () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ w: 1600, h: 1200 })
    expect(fitWithin(1000, 3000, 1600)).toEqual({ w: 533, h: 1600 })
  })
  it('never enlarges', () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ w: 800, h: 600 })
  })
})

describe('scanReceipt', () => {
  const file = { mime: 'image/jpeg', data: 'AAAA' }
  it('returns the scan and sends the token', async () => {
    let seen: RequestInit | undefined
    const f = (async (_u: unknown, init: RequestInit) => { seen = init; return new Response(JSON.stringify({ ok: true, scan: { merchant: 'X' }, used: 2, limit: 20 })) }) as unknown as typeof fetch
    const r = await scanReceipt(file, 'tok', f)
    expect(r).toMatchObject({ scan: { merchant: 'X' }, used: 2, limit: 20 })
    expect((seen?.headers as Record<string, string>).authorization).toBe('Bearer tok')
  })
  it('turns the limit reply into an error carrying the reset time', async () => {
    const err = await scanReceipt(file, 't', reply(429, { ok: false, error: 'limit', message: 'You have used all 20 scans for today.', resetsAt: '2026-10-23T00:00:00Z' })).catch((e) => e)
    expect(err).toBeInstanceOf(ScanError)
    expect(err.code).toBe('limit')
    expect(err.resetsAt?.toISOString()).toBe('2026-10-23T00:00:00.000Z')
    expect(limitMessage(err)).toMatch(/^You have used all 20 scans for today\. Scanning is available again at /)
  })
  it('explains an unreadable photo', async () => {
    const err = await scanReceipt(file, 't', reply(422, { ok: false, error: 'unreadable', message: 'Try a clearer photo.' })).catch((e) => e)
    expect(err.code).toBe('unreadable')
  })
  it('handles being offline and a broken reply', async () => {
    const offline = (async () => { throw new TypeError('network') }) as unknown as typeof fetch
    expect((await scanReceipt(file, 't', offline).catch((e) => e)).code).toBe('unavailable')
    const html = (async () => new Response('<html>', { status: 500 })) as unknown as typeof fetch
    expect((await scanReceipt(file, 't', html).catch((e) => e)).code).toBe('unavailable')
  })
})

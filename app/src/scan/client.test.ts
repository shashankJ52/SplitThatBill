import { describe, expect, it } from 'vitest'
import { fitWithin, limitMessage, prepareFiles, scanReceipt, ScanError } from './client'

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
  it('sends one photo, or several in order, as a list of pages', async () => {
    const sent: unknown[] = []
    const f = (async (_u: unknown, init: RequestInit) => { sent.push(JSON.parse(String(init.body))); return new Response(JSON.stringify({ ok: true, scan: { merchant: 'X' }, used: 1, limit: 20 })) }) as unknown as typeof fetch
    await scanReceipt(file, 't', f)
    await scanReceipt([file, { mime: 'image/jpeg', data: 'BBBB' }], 't', f)
    expect(sent).toEqual([{ pages: [file] }, { pages: [file, { mime: 'image/jpeg', data: 'BBBB' }] }])
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

describe('prepareFiles', () => {
  const file = (name: string, type: string, size = 1000) => ({ name, type, size }) as unknown as File
  it('needs at least one file and at most six', async () => {
    await expect(prepareFiles([])).rejects.toMatchObject({ code: 'bad_request' })
    const seven = Array.from({ length: 7 }, (_, i) => file(`${i}.jpg`, 'image/jpeg'))
    await expect(prepareFiles(seven)).rejects.toThrow(/at most 6/)
  })
  it('does not mix a PDF with photos, and refuses a PDF over 3 MB', async () => {
    await expect(prepareFiles([file('a.jpg', 'image/jpeg'), file('b.pdf', 'application/pdf')])).rejects.toThrow(/on its own/)
    await expect(prepareFiles([file('big.pdf', 'application/pdf', 4 * 1024 * 1024)])).rejects.toThrow(/over 3 MB/)
  })
})

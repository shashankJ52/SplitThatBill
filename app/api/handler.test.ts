import { describe, expect, it, vi } from 'vitest'
import { handleScan, type ScanDeps, type ScanReply } from './_handler.js'

const data = 'A'.repeat(400)
const answer = {
  is_receipt: true, merchant: 'Corner Deli', location: '', category: 'Eating out', date: '',
  items: [{ name: 'Sandwich', qty: 2, total_cents: 1400 }], tax_cents: 100, tip_cents: 0, discount_cents: 0, total_cents: 1500, hidden: ['card number'],
}

function setup(over: { credit?: object | Response; read?: ScanDeps['read'] } = {}) {
  const calls: string[] = []
  const fetchMock = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
    const name = String(url).split('/rpc/')[1]
    calls.push(name)
    if (name === 'refund_scan_credit') return new Response('null', { status: 200 })
    if (over.credit instanceof Response) return over.credit
    return new Response(JSON.stringify(over.credit ?? { ok: true, used: 3, limit: 20, resets_at: '2026-10-23T00:00:00Z' }), { status: 200 })
  })
  const read = over.read ?? vi.fn(async () => answer)
  const deps: ScanDeps = { supabaseUrl: 'https://x.supabase.co', supabaseKey: 'pub', read, fetch: fetchMock as unknown as typeof fetch }
  return { deps, calls, fetchMock, read }
}
const req = (body: unknown, auth: string | null = 'Bearer tok') =>
  new Request('https://app/api/scan', { method: 'POST', headers: auth ? { authorization: auth } : {}, body: typeof body === 'string' ? body : JSON.stringify(body) })
const reply = async (r: Response) => (await r.json()) as ScanReply

describe('POST /api/scan', () => {
  it('reads a receipt for a signed-in person and reports how many scans are used', async () => {
    const { deps, calls, read } = setup()
    const r = await handleScan(req({ mime: 'image/jpeg', data }), deps)
    expect(r.status).toBe(200)
    expect(await reply(r)).toMatchObject({ ok: true, used: 3, limit: 20, scan: { merchant: 'Corner Deli', total: 1500, hidden: ['card number'] } })
    expect(calls).toEqual(['take_scan_credit'])
    expect(read).toHaveBeenCalledWith({ mime: 'image/jpeg', data })
  })

  it('says how long the credit check and the reading took, so a slow scan can be traced', async () => {
    const { deps } = setup()
    const r = await handleScan(req({ mime: 'image/jpeg', data }), deps)
    expect(r.headers.get('server-timing')).toMatch(/^credit;dur=\d+, read;dur=\d+$/)
  })

  it("sends the person's own token to the database, never the service key", async () => {
    const { deps, fetchMock } = setup()
    await handleScan(req({ mime: 'image/png', data }), deps)
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok')
    expect((init.headers as Record<string, string>).apikey).toBe('pub')
  })

  it('refuses signed-out requests without reading anything', async () => {
    const { deps, calls, read } = setup()
    const r = await handleScan(req({ mime: 'image/jpeg', data }, null), deps)
    expect(r.status).toBe(401)
    expect(calls).toEqual([])
    expect(read).not.toHaveBeenCalled()
  })

  it('refuses an expired session', async () => {
    const { deps, read } = setup({ credit: new Response('{}', { status: 401 }) })
    const r = await handleScan(req({ mime: 'image/jpeg', data }), deps)
    expect(r.status).toBe(401)
    expect(read).not.toHaveBeenCalled()
  })

  it('refuses the scan after the daily limit, says when it resets, and does not call the reader', async () => {
    const { deps, read } = setup({ credit: { ok: false, used: 20, limit: 20, resets_at: '2026-10-23T00:00:00Z' } })
    const r = await handleScan(req({ mime: 'image/jpeg', data }), deps)
    expect(r.status).toBe(429)
    expect(await reply(r)).toMatchObject({ ok: false, error: 'limit', resetsAt: '2026-10-23T00:00:00Z' })
    expect(read).not.toHaveBeenCalled()
  })

  it('gives the scan back when the reading service fails', async () => {
    const { deps, calls } = setup({ read: async () => { throw new Error('boom') } })
    const r = await handleScan(req({ mime: 'image/jpeg', data }), deps)
    expect(r.status).toBe(502)
    expect(await reply(r)).toMatchObject({ ok: false, error: 'unavailable' })
    expect(calls).toEqual(['take_scan_credit', 'refund_scan_credit'])
  })

  it('does not give the scan back when the photo was not a readable receipt', async () => {
    const { deps, calls } = setup({ read: async () => ({ ...answer, is_receipt: false }) })
    const r = await handleScan(req({ mime: 'image/jpeg', data }), deps)
    expect(r.status).toBe(422)
    expect(await reply(r)).toMatchObject({ ok: false, error: 'unreadable' })
    expect(calls).toEqual(['take_scan_credit'])
  })

  it('rejects bad input before using a scan', async () => {
    for (const body of ['not json', {}, { mime: 'text/html', data }, { mime: 'image/jpeg', data: 'short' }, { mime: 'image/jpeg', data: 'not base64!!' + 'A'.repeat(200) }]) {
      const { deps, calls } = setup()
      const r = await handleScan(req(body), deps)
      expect(r.status).toBe(400)
      expect(calls).toEqual([])
    }
  })

  it('rejects an oversized body', async () => {
    const { deps, calls } = setup()
    const r = await handleScan(req({ mime: 'image/jpeg', data: 'A'.repeat(4_300_000) }), deps)
    expect(r.status).toBe(413)
    expect(calls).toEqual([])
  })

  it('says scanning is unavailable when the database cannot be reached', async () => {
    const { deps, read } = setup({ credit: new Response('oops', { status: 500 }) })
    const r = await handleScan(req({ mime: 'image/jpeg', data }), deps)
    expect(r.status).toBe(503)
    expect(read).not.toHaveBeenCalled()
  })
})

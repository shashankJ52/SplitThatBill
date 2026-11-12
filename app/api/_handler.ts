import { parseScan, type ScanResult } from '../src/scan/receipt.js'

/** Photo types the reader accepts (a PDF is read as a document). */
const MEDIA = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
/** The largest request body taken in. The app shrinks photos long before this; it keeps abuse cheap to refuse. */
const MAX_BODY = 4_200_000

/** One photo or PDF of a receipt, ready to send. */
export interface ScanPage { mime: string; data: string }
/** A long receipt may arrive as several photos, top to bottom. */
export const MAX_PAGES = 6

export interface ScanDeps {
  supabaseUrl: string
  supabaseKey: string
  /** Send the pages of one receipt to the reading service and return what it said, as parsed JSON. Throws when the service fails. */
  read(pages: ScanPage[]): Promise<unknown>
  fetch: typeof fetch
}

export type ScanReply =
  | { ok: true; scan: ScanResult; used: number; limit: number }
  | { ok: false; error: 'signin' | 'limit' | 'bad_request' | 'unreadable' | 'unavailable'; message: string; resetsAt?: string }

class PagesError extends Error {}
const okPage = (x: unknown): x is ScanPage => {
  const p = x as { mime?: unknown; data?: unknown } | null
  return !!p && typeof p.mime === 'string' && MEDIA.includes(p.mime) && typeof p.data === 'string' && p.data.length >= 100 && /^[A-Za-z0-9+/]+={0,2}$/.test(p.data)
}
/** The request holds `pages` (one to six), or, from an older copy of the app, a single `{mime, data}`. */
export function parsePages(body: unknown): ScanPage[] {
  const b = (body ?? {}) as { pages?: unknown; mime?: unknown; data?: unknown }
  const list = Array.isArray(b.pages) ? b.pages : [{ mime: b.mime, data: b.data }]
  if (!list.length) throw new PagesError('Add at least one photo of the receipt.')
  if (list.length > MAX_PAGES) throw new PagesError(`Use at most ${MAX_PAGES} photos for one receipt.`)
  if (!list.every(okPage)) throw new PagesError('One of those files could not be read. Choose photos or a PDF.')
  if (list.length > 1 && list.some((p) => p.mime === 'application/pdf')) throw new PagesError('A PDF has to be read on its own. Upload the PDF by itself, or use photos.')
  return list as ScanPage[]
}

const json = (status: number, body: ScanReply, timing?: string) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...(timing ? { 'server-timing': timing } : {}) } })
const fail = (status: number, error: Exclude<ScanReply, { ok: true }>['error'], message: string, resetsAt?: string) =>
  json(status, { ok: false, error, message, ...(resetsAt ? { resetsAt } : {}) })

/**
 * One scan: check who is asking, use one of their daily scans, read the photo, and hand back tidy data.
 * The photo is never written anywhere and nothing about it is logged.
 */
export async function handleScan(req: Request, deps: ScanDeps): Promise<Response> {
  const auth = req.headers.get('authorization') ?? ''
  const token = /^Bearer (.+)$/.exec(auth)?.[1]
  if (!token) return fail(401, 'signin', 'Sign in to scan receipts.')

  const raw = await req.text()
  if (raw.length > MAX_BODY) return fail(413, 'bad_request', 'That photo is too large. Try a smaller one.')
  let pages: ScanPage[]
  try {
    pages = parsePages(JSON.parse(raw))
  } catch (e) {
    return fail(400, 'bad_request', e instanceof PagesError ? e.message : 'That file could not be read. Choose a photo or a PDF.')
  }

  const rpc = (name: string) =>
    deps.fetch(`${deps.supabaseUrl}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: deps.supabaseKey, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: '{}',
    })

  // how long each step took, sent back as a Server-Timing header so a slow scan can be traced to its step
  const t0 = Date.now()
  // use one of today's scans first; the database counts them, so this cannot be skipped
  let credit: { ok: boolean; used: number; limit: number; resets_at: string }
  try {
    const r = await rpc('take_scan_credit')
    if (r.status === 401 || r.status === 403) return fail(401, 'signin', 'Your session has expired. Sign in again.')
    if (!r.ok) throw new Error(`credit ${r.status}`)
    credit = (await r.json()) as typeof credit
  } catch {
    return fail(503, 'unavailable', 'Scanning is not available right now. You can enter the items yourself.')
  }
  if (!credit.ok) return fail(429, 'limit', `You have used all ${credit.limit} scans for today.`, credit.resets_at)
  const t1 = Date.now()

  let answer: unknown
  try {
    answer = await deps.read(pages)
  } catch {
    // the service failed, not the person: give the scan back
    await rpc('refund_scan_credit').catch(() => undefined)
    return fail(502, 'unavailable', 'Could not read the receipt right now. Try again, or enter the items yourself.')
  }
  const scan = parseScan(answer)
  if (!scan) return fail(422, 'unreadable', 'That does not look like a readable receipt. Try a clearer, well-lit photo of the whole receipt.')
  const t2 = Date.now()
  return json(200, { ok: true, scan, used: credit.used, limit: credit.limit }, `credit;dur=${t1 - t0}, read;dur=${t2 - t1}`)
}

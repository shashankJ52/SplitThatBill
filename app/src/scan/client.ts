import type { ScanResult } from './receipt'

/** Why a scan did not produce a receipt. `limit` carries when scanning opens up again. */
export class ScanError extends Error {
  readonly code: 'signin' | 'limit' | 'bad_request' | 'unreadable' | 'unavailable'
  readonly resetsAt?: Date
  constructor(code: ScanError['code'], message: string, resetsAt?: string) {
    super(message)
    this.code = code
    if (resetsAt) this.resetsAt = new Date(resetsAt)
  }
}

/** Longest side of the photo sent for reading. Receipts stay legible at this size and the upload stays small. */
export const MAX_SIDE = 1600
/** The most a PDF may weigh; it cannot be shrunk like a photo. */
export const MAX_PDF = 3 * 1024 * 1024

export function fitWithin(w: number, h: number, max: number): { w: number; h: number } {
  const k = Math.min(1, max / Math.max(w, h))
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) }
}

const toBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
    r.onerror = () => reject(new Error('read'))
    r.readAsDataURL(blob)
  })

/** Shrink a photo to a JPEG (a PDF is sent as it is) and return it ready to upload. */
export async function prepareFile(file: File): Promise<{ mime: string; data: string }> {
  if (file.type === 'application/pdf') {
    if (file.size > MAX_PDF) throw new ScanError('bad_request', 'That PDF is over 3 MB. Take a photo of the receipt instead.')
    return { mime: 'application/pdf', data: await toBase64(file) }
  }
  let bmp: ImageBitmap
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new ScanError('bad_request', 'Could not open that photo. Try a JPEG or PNG.')
  }
  const { w, h } = fitWithin(bmp.width, bmp.height, MAX_SIDE)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')?.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85))
  if (!blob) throw new ScanError('bad_request', 'Could not prepare that photo. Try another one.')
  return { mime: 'image/jpeg', data: await toBase64(blob) }
}

/** Send a prepared photo to the scan function and return the receipt it read. */
export async function scanReceipt(file: { mime: string; data: string }, token: string, doFetch: typeof fetch = fetch): Promise<{ scan: ScanResult; used: number; limit: number }> {
  let res: Response
  try {
    res = await doFetch('/api/scan', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(file) })
  } catch {
    throw new ScanError('unavailable', 'No connection. Check your internet and try again, or enter the items yourself.')
  }
  let body: unknown
  try {
    body = await res.json()
  } catch {
    throw new ScanError('unavailable', 'Scanning is not available right now. You can enter the items yourself.')
  }
  const b = body as { ok?: boolean; scan?: ScanResult; used?: number; limit?: number; error?: ScanError['code']; message?: string; resetsAt?: string }
  if (b.ok && b.scan) return { scan: b.scan, used: b.used ?? 0, limit: b.limit ?? 0 }
  throw new ScanError(b.error ?? 'unavailable', b.message ?? 'Could not read the receipt. You can enter the items yourself.', b.resetsAt)
}

/** "You have used all 20 scans for today. Scanning is available again at 7:00 PM." in the viewer's own clock. */
export const limitMessage = (e: ScanError) =>
  e.resetsAt ? `${e.message} Scanning is available again at ${e.resetsAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}.` : e.message

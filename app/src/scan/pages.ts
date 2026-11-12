/** The photos that make up one receipt: choosing, ordering and sizing them. Plain functions, so they are easy to test. */

/** A long receipt may be captured as up to this many photos. */
export const MAX_PAGES = 6
/** Each photo as picked, before it is shrunk. */
export const MAX_FILE = 15 * 1024 * 1024
/** What all the shrunk photos together may weigh once encoded for upload; the server refuses more than about 4.2 MB. */
export const MAX_TOTAL_BASE64 = 3_900_000

export const isPdf = (f: Pick<File, 'type'>) => f.type === 'application/pdf'
export const isReceiptFile = (f: Pick<File, 'type'>) => /^(image\/|application\/pdf)/.test(f.type)

export type AddResult = {
  files: File[]
  /** how many picked files were left out (too many, too big, not a photo, or a PDF that cannot join others) */
  skipped: number
  /** the most useful thing to tell the person, when something was left out */
  reason?: 'full' | 'big' | 'type' | 'pdf'
}

/**
 * Add picked files to the pages so far, keeping the order they were picked in. A PDF is read on its own, so it can only be
 * the single page; photos fill the rest up to the limit.
 */
export function addFiles(current: File[], picked: File[]): AddResult {
  let files = current.slice()
  let skipped = 0
  let reason: AddResult['reason']
  const note = (r: NonNullable<AddResult['reason']>) => {
    skipped++
    reason ??= r
  }
  for (const f of picked) {
    if (!isReceiptFile(f)) note('type')
    else if (f.size > MAX_FILE) note('big')
    else if (isPdf(f) && files.length > 0) note('pdf')
    else if (files.some(isPdf)) note('pdf')
    else if (files.length >= MAX_PAGES) note('full')
    else files = [...files, f]
  }
  return { files, skipped, ...(reason ? { reason } : {}) }
}

export const removeAt = <T,>(list: T[], i: number): T[] => list.filter((_, k) => k !== i)

/** Move one page one place earlier (-1) or later (+1). Out-of-range moves leave the list as it is. */
export function movePage<T>(list: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir
  if (i < 0 || i >= list.length || j < 0 || j >= list.length) return list
  const out = list.slice()
  ;[out[i], out[j]] = [out[j], out[i]]
  return out
}

/** The longest side each photo is shrunk to: more photos means a bit smaller each, so they all still fit in one upload. */
export const sideFor = (pages: number, attempt = 0): number => {
  const base = pages <= 2 ? 1600 : pages <= 4 ? 1400 : 1200
  return Math.round(base * 0.8 ** attempt)
}
/** JPEG quality for the same reason: a first try, then lower if it still does not fit. */
export const qualityFor = (attempt = 0): number => (attempt === 0 ? 0.85 : attempt === 1 ? 0.78 : 0.7)
/** How many times to shrink again before giving up. */
export const MAX_ATTEMPTS = 3

/** What a message about skipped files should say. */
export function skippedMessage(r: AddResult): string {
  if (!r.skipped) return ''
  const n = r.skipped === 1 ? 'One file was' : `${r.skipped} files were`
  switch (r.reason) {
    case 'full': return `${n} left out: a receipt can have up to ${MAX_PAGES} photos.`
    case 'big': return `${n} left out for being over 15 MB.`
    case 'pdf': return `${n} left out: a PDF is read on its own, not together with photos.`
    default: return `${n} left out because it is not a photo.`
  }
}

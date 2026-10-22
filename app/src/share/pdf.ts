/**
 * A tiny PDF writer: pages that each hold one JPEG picture. No libraries, so it costs next to nothing to load. The bill
 * pictures are drawn on a canvas, so a PDF of one is those pictures laid onto paper, cut into pages when they are tall.
 */

export interface PageImage {
  /** JPEG file bytes */
  jpeg: Uint8Array
  /** the picture's size in pixels */
  w: number
  h: number
}

export interface Paper {
  name: 'Letter' | 'A4'
  /** page size in points (1/72 inch) */
  w: number
  h: number
}

export const PAPERS: Record<Paper['name'], Paper> = {
  Letter: { name: 'Letter', w: 612, h: 792 },
  A4: { name: 'A4', w: 595, h: 842 },
}

/** Whitespace around the picture on each page, in points. */
export const MARGIN = 40

/** How many picture pixels fit on one page, and how big a pixel is on paper, for a picture of the given width. */
export function pageFit(imageW: number, paper: Paper, margin = MARGIN): { pxPerPage: number; pt: number } {
  const contentW = paper.w - margin * 2
  const contentH = paper.h - margin * 2
  const pt = contentW / imageW // points per pixel
  return { pxPerPage: Math.floor(contentH / pt), pt }
}

/**
 * Cut a tall picture into pages, as [top, height] in pixels. A page ends at the last allowed break that still fits, so a
 * row is never cut in half; only a block taller than a whole page is cut where the page runs out.
 */
export function paginate(totalH: number, breaks: number[], pxPerPage: number): [number, number][] {
  const out: [number, number][] = []
  let top = 0
  while (top < totalH) {
    const limit = top + pxPerPage
    if (limit >= totalH) {
      out.push([top, totalH - top])
      break
    }
    const fits = breaks.filter((b) => b > top && b <= limit)
    const cut = fits.length ? Math.max(...fits) : limit
    out.push([top, cut - top])
    top = cut
  }
  return out
}

const enc = new TextEncoder()
const bytes = (s: string) => enc.encode(s)
const pdfDate = (d: Date) => `D:${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}${String(d.getUTCSeconds()).padStart(2, '0')}Z`
const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`).replace(/[^\x20-\x7e]/g, '?')

/** Put the pages together as a PDF file. Each picture is placed at the top of its page, as wide as the margins allow. */
export function buildPdf(pages: PageImage[], paper: Paper, opts: { title: string; margin?: number; now?: Date } = { title: '' }): Uint8Array {
  const margin = opts.margin ?? MARGIN
  const parts: Uint8Array[] = []
  const offsets: number[] = []
  let size = 0
  const push = (b: Uint8Array) => {
    parts.push(b)
    size += b.length
  }
  const obj = (n: number, body: Uint8Array | string) => {
    offsets[n] = size
    push(bytes(`${n} 0 obj\n`))
    push(typeof body === 'string' ? bytes(body) : body)
    push(bytes('\nendobj\n'))
  }
  // object numbers: 1 catalog, 2 page tree, 3 info, then three per page (page, content, image)
  const pageNo = (i: number) => 4 + i * 3
  push(bytes('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'))
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>')
  obj(2, `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${pageNo(i)} 0 R`).join(' ')}] >>`)
  obj(3, `<< /Title (${esc(opts.title)}) /Producer (SplitThatBill) /CreationDate (${pdfDate(opts.now ?? new Date())}) >>`)
  pages.forEach((p, i) => {
    const n = pageNo(i)
    const contentW = paper.w - margin * 2
    const drawH = (p.h / p.w) * contentW
    const content = `q ${contentW.toFixed(2)} 0 0 ${drawH.toFixed(2)} ${margin} ${(paper.h - margin - drawH).toFixed(2)} cm /Im0 Do Q`
    obj(n, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${paper.w} ${paper.h}] /Resources << /XObject << /Im0 ${n + 2} 0 R >> >> /Contents ${n + 1} 0 R >>`)
    obj(n + 1, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`)
    const head = bytes(`<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`)
    const whole = new Uint8Array(head.length + p.jpeg.length + 10)
    whole.set(head, 0)
    whole.set(p.jpeg, head.length)
    whole.set(bytes('\nendstream'), head.length + p.jpeg.length)
    obj(n + 2, whole)
  })
  const count = 4 + pages.length * 3
  const xref = size
  let table = `xref\n0 ${count}\n0000000000 65535 f \n`
  for (let i = 1; i < count; i++) table += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  push(bytes(`${table}trailer\n<< /Size ${count} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`))
  const out = new Uint8Array(size)
  let at = 0
  for (const b of parts) {
    out.set(b, at)
    at += b.length
  }
  return out
}

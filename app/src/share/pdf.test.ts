import { describe, expect, it } from 'vitest'
import { buildPdf, MARGIN, PAPERS, pageFit, paginate } from './pdf'

const fakeJpeg = (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 7) % 256)
const text = (b: Uint8Array) => new TextDecoder('latin1').decode(b)

describe('buildPdf', () => {
  const pages = [{ jpeg: fakeJpeg(500), w: 1000, h: 800 }, { jpeg: fakeJpeg(300), w: 1000, h: 400 }]
  const pdf = buildPdf(pages, PAPERS.Letter, { title: 'Trattoria (Roma)', now: new Date('2026-10-20T12:00:00Z') })
  const s = text(pdf)

  it('is a PDF with one page object per picture', () => {
    expect(s.startsWith('%PDF-1.4')).toBe(true)
    expect(s.trimEnd().endsWith('%%EOF')).toBe(true)
    expect(s).toContain('/Count 2')
    expect((s.match(/\/Type \/Page /g) ?? []).length).toBe(2)
    expect(s).toContain('/MediaBox [0 0 612 792]')
  })
  it('records where every object is, so readers can open it', () => {
    const start = Number(/startxref\n(\d+)\n/.exec(s)?.[1])
    expect(s.slice(start, start + 4)).toBe('xref')
    const lines = s.slice(start).split('\n')
    const count = Number(lines[1].split(' ')[1])
    expect(count).toBe(4 + pages.length * 3)
    for (let i = 1; i < count; i++) {
      const off = Number(lines[2 + i].slice(0, 10))
      expect(s.slice(off, off + `${i} 0 obj`.length)).toBe(`${i} 0 obj`)
    }
  })
  it('stores the pictures untouched and says how long they are', () => {
    expect(s).toContain('/Filter /DCTDecode /Length 500')
    expect(s).toContain('/Filter /DCTDecode /Length 300')
    const at = s.indexOf('/Length 500 >>\nstream\n') + '/Length 500 >>\nstream\n'.length
    expect(Array.from(pdf.slice(at, at + 500))).toEqual(Array.from(fakeJpeg(500)))
  })
  it('keeps the title safe inside the file', () => {
    expect(s).toContain('/Title (Trattoria \\(Roma\\))')
    expect(s).toContain('/CreationDate (D:20261020120000Z)')
  })
  it('places the picture at the top of the page, as wide as the margins allow', () => {
    const contentW = 612 - MARGIN * 2
    expect(s).toContain(`q ${contentW.toFixed(2)} 0 0 ${((800 / 1000) * contentW).toFixed(2)} ${MARGIN} ${(792 - MARGIN - (800 / 1000) * contentW).toFixed(2)} cm /Im0 Do Q`)
  })
})

describe('fitting a picture onto pages', () => {
  it('a picture as wide as 1080 pixels on Letter fits about 1500 pixels a page', () => {
    const { pxPerPage, pt } = pageFit(1080, PAPERS.Letter)
    expect(pt).toBeCloseTo((612 - 80) / 1080, 5)
    expect(pxPerPage).toBe(Math.floor((792 - 80) / pt))
  })
  it('A4 is taller than Letter, so it fits more', () => {
    expect(pageFit(1080, PAPERS.A4).pxPerPage).toBeGreaterThan(pageFit(1080, PAPERS.Letter).pxPerPage)
  })
  it('keeps a short picture whole', () => {
    expect(paginate(900, [300, 600], 1400)).toEqual([[0, 900]])
    expect(paginate(1400, [], 1400)).toEqual([[0, 1400]])
  })
  it('ends a page at the last break that fits, so no row is cut in half', () => {
    // rows end at 400, 800, 1200, 1600, 2000; a page holds 1000 pixels
    expect(paginate(2000, [400, 800, 1200, 1600], 1000)).toEqual([[0, 800], [800, 800], [1600, 400]])
  })
  it('starts the next page where the last one ended', () => {
    const pages = paginate(3300, [500, 1000, 1500, 2000, 2500, 3000], 1200)
    expect(pages[0][0]).toBe(0)
    pages.forEach(([top], i) => i > 0 && expect(top).toBe(pages[i - 1][0] + pages[i - 1][1]))
    expect(pages.at(-1)).toBeDefined()
    expect(pages.reduce((n, [, h]) => n + h, 0)).toBe(3300)
  })
  it('cuts a block taller than a page where the page runs out', () => {
    expect(paginate(3000, [], 1000)).toEqual([[0, 1000], [1000, 1000], [2000, 1000]])
  })
})

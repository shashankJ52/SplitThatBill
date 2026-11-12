import { describe, expect, it } from 'vitest'
import { addFiles, MAX_PAGES, MAX_FILE, movePage, qualityFor, removeAt, sideFor, skippedMessage } from './pages'

const f = (name: string, type = 'image/jpeg', size = 1000) => ({ name, type, size }) as unknown as File
const names = (l: File[]) => l.map((x) => x.name)

describe('adding photos', () => {
  it('keeps the order they were picked in and adds to what is already there', () => {
    const a = addFiles([], [f('1'), f('2')])
    expect(names(a.files)).toEqual(['1', '2'])
    expect(names(addFiles(a.files, [f('3')]).files)).toEqual(['1', '2', '3'])
  })
  it('stops at the limit and says why', () => {
    const many = Array.from({ length: MAX_PAGES + 2 }, (_, i) => f(String(i)))
    const r = addFiles([], many)
    expect(r.files).toHaveLength(MAX_PAGES)
    expect(r.skipped).toBe(2)
    expect(r.reason).toBe('full')
    expect(skippedMessage(r)).toMatch(/up to 6 photos/)
  })
  it('leaves out anything that is not a photo or a PDF, and anything over 15 MB', () => {
    expect(addFiles([], [f('x', 'text/plain')])).toMatchObject({ files: [], skipped: 1, reason: 'type' })
    expect(addFiles([], [f('big', 'image/png', MAX_FILE + 1), f('ok')])).toMatchObject({ skipped: 1, reason: 'big' })
    expect(names(addFiles([], [f('big', 'image/png', MAX_FILE + 1), f('ok')]).files)).toEqual(['ok'])
  })
  it('lets a PDF be the only page, and not join photos in either direction', () => {
    expect(names(addFiles([], [f('r.pdf', 'application/pdf')]).files)).toEqual(['r.pdf'])
    expect(addFiles([f('p1')], [f('r.pdf', 'application/pdf')])).toMatchObject({ skipped: 1, reason: 'pdf' })
    expect(addFiles([f('r.pdf', 'application/pdf')], [f('p2')])).toMatchObject({ skipped: 1, reason: 'pdf' })
    expect(addFiles([], [f('a'), f('b.pdf', 'application/pdf')]).skipped).toBe(1)
    expect(skippedMessage(addFiles([f('p1')], [f('r.pdf', 'application/pdf')]))).toMatch(/PDF is read on its own/)
  })
  it('says nothing when nothing was left out', () => {
    expect(skippedMessage(addFiles([], [f('1')]))).toBe('')
  })
})

describe('ordering and removing', () => {
  it('moves a page earlier or later, and ignores moves off either end', () => {
    expect(movePage(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c'])
    expect(movePage(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b'])
    const l = ['a', 'b', 'c']
    expect(movePage(l, 0, -1)).toBe(l)
    expect(movePage(l, 2, 1)).toBe(l)
    expect(movePage(l, 9, 1)).toBe(l)
  })
  it('does not change the original list', () => {
    const l = ['a', 'b']
    movePage(l, 0, 1)
    removeAt(l, 0)
    expect(l).toEqual(['a', 'b'])
  })
  it('removes one page by position', () => {
    expect(removeAt(['a', 'b', 'c'], 1)).toEqual(['a', 'c'])
  })
})

describe('sizing photos to fit one upload', () => {
  it('shrinks each photo a little more as there are more of them, and again on each retry', () => {
    expect(sideFor(1)).toBe(1600)
    expect(sideFor(2)).toBe(1600)
    expect(sideFor(3)).toBe(1400)
    expect(sideFor(6)).toBe(1200)
    expect(sideFor(6, 1)).toBeLessThan(sideFor(6, 0))
    expect(sideFor(6, 2)).toBeLessThan(sideFor(6, 1))
  })
  it('lowers the quality on retries but never below something readable', () => {
    expect([0, 1, 2, 3].map(qualityFor)).toEqual([0.85, 0.78, 0.7, 0.7])
  })
  it('keeps a long receipt readable: six photos still get a 1200px side', () => {
    expect(sideFor(MAX_PAGES, 0)).toBeGreaterThanOrEqual(1200)
  })
})

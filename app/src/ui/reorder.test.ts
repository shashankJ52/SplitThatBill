import { describe, expect, it } from 'vitest'
import { isSwipe, landingIndex, moveKey, reorderSubset, shiftFor } from './reorder'

const slots = [0, 1, 2, 3].map((i) => ({ top: i * 60, height: 50 }))

describe('dragging a row', () => {
  it('stays put until it passes the middle of its neighbour', () => {
    expect(landingIndex(slots, 1, 0)).toBe(1)
    expect(landingIndex(slots, 1, 20)).toBe(1)
    expect(landingIndex(slots, 1, 40)).toBe(1) // the next row's middle is 60 further down
    expect(landingIndex(slots, 1, 65)).toBe(2)
  })
  it('lands at the ends when dragged far enough', () => {
    expect(landingIndex(slots, 0, 500)).toBe(3)
    expect(landingIndex(slots, 3, -500)).toBe(0)
  })
  it('rows in between slide out of the way, others stay', () => {
    // dragging row 0 down to place 2: rows 1 and 2 move up
    expect([0, 1, 2, 3].map((i) => shiftFor(i, 0, 2, 60))).toEqual([0, -60, -60, 0])
    // dragging row 3 up to place 1: rows 1 and 2 move down
    expect([0, 1, 2, 3].map((i) => shiftFor(i, 3, 1, 60))).toEqual([0, 60, 60, 0])
    expect([0, 1, 2, 3].map((i) => shiftFor(i, 2, 2, 60))).toEqual([0, 0, 0, 0])
  })
  it('moves a key to its new place without losing or doubling any', () => {
    expect(moveKey(['a', 'b', 'c', 'd'], 'a', 2)).toEqual(['b', 'c', 'a', 'd'])
    expect(moveKey(['a', 'b', 'c', 'd'], 'd', 0)).toEqual(['d', 'a', 'b', 'c'])
    expect(moveKey(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'b', 'c'])
    expect(moveKey(['a', 'b', 'c'], 'a', 99)).toEqual(['b', 'c', 'a'])
    expect(moveKey(['a', 'b', 'c'], 'c', -5)).toEqual(['c', 'a', 'b'])
  })
  it('agrees with itself: the landing index and the key move give the same order', () => {
    const keys = ['a', 'b', 'c', 'd']
    for (let from = 0; from < 4; from++) for (const dy of [-200, -70, -20, 0, 20, 70, 200]) {
      const to = landingIndex(slots, from, dy)
      const out = moveKey(keys, keys[from], to)
      expect(out.slice().sort()).toEqual(keys)
      expect(out[to]).toBe(keys[from])
    }
  })
})

describe('telling a swipe from a scroll', () => {
  it('needs a clearly sideways movement', () => {
    expect(isSwipe(40, 5)).toBe(true)
    expect(isSwipe(-40, 5)).toBe(true)
    expect(isSwipe(40, 40)).toBe(false)
    expect(isSwipe(8, 0)).toBe(false)
    expect(isSwipe(5, 60)).toBe(false)
  })
})

describe('rearranging only the rows you can see', () => {
  it('rows that are hidden by a filter keep their places', () => {
    // a, b, c, d, e with b and d hidden: dragging e above c swaps the visible ones only
    expect(reorderSubset(['a', 'b', 'c', 'd', 'e'], ['e', 'a', 'c'])).toEqual(['e', 'b', 'a', 'd', 'c'])
  })
  it('is a plain reorder when everything is visible', () => {
    expect(reorderSubset(['a', 'b', 'c'], ['c', 'a', 'b'])).toEqual(['c', 'a', 'b'])
  })
  it('never loses or duplicates a row', () => {
    const out = reorderSubset(['a', 'b', 'c', 'd'], ['d', 'b'])
    expect(out.slice().sort()).toEqual(['a', 'b', 'c', 'd'])
  })
})

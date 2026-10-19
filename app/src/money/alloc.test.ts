import { describe, expect, it } from 'vitest'
import { allocCents, splitEven, splitProp } from './alloc'
import { rng } from './fixtures'

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)

describe('splitEven', () => {
  it('gives leftover pennies to the first people', () => {
    expect(splitEven(100, 3)).toEqual([34, 33, 33])
    expect(splitEven(1, 3)).toEqual([1, 0, 0])
    expect(splitEven(0, 4)).toEqual([0, 0, 0, 0])
  })
  it('always adds up', () => {
    const r = rng(1)
    for (let i = 0; i < 500; i++) {
      const c = Math.floor(r() * 100000)
      const n = 1 + Math.floor(r() * 9)
      expect(sum(splitEven(c, n))).toBe(c)
    }
  })
})

describe('splitProp', () => {
  it('shares in proportion', () => {
    expect(splitProp(1000, [3000, 1000])).toEqual([750, 250])
  })
  it('gives leftovers only to people who have a subtotal', () => {
    const out = splitProp(100, [0, 1, 1, 1])
    expect(out[0]).toBe(0)
    expect(sum(out)).toBe(100)
  })
  it('returns zeros when nobody has a subtotal', () => {
    expect(splitProp(500, [0, 0])).toEqual([0, 0])
  })
  it('always adds up when anyone has a subtotal', () => {
    const r = rng(2)
    for (let i = 0; i < 500; i++) {
      const subs = Array.from({ length: 1 + Math.floor(r() * 6) }, () => Math.floor(r() * 5000))
      if (!sum(subs)) continue
      const fee = Math.floor(r() * 10000)
      expect(sum(splitProp(fee, subs))).toBe(fee)
    }
  })
})

describe('allocCents', () => {
  it('splits 4 colas as 0.5 / 2.5 / 1 portions', () => {
    // $12.00 for 4 colas: you 0.5, James 2.5, Marie 1
    expect(allocCents(1200, { me: 0.5, james: 2.5, marie: 1 })).toEqual({ me: 150, james: 750, marie: 300 })
  })
  it('handles uneven weights with exact cents', () => {
    const out = allocCents(1000, { a: 1, b: 1, c: 1 })
    expect(sum(Object.values(out))).toBe(1000)
    expect(Object.values(out).sort()).toEqual([333, 333, 334])
  })
  it('ignores zero weights and handles empty input', () => {
    expect(allocCents(500, { a: 0, b: 2 })).toEqual({ b: 500 })
    expect(allocCents(500, {})).toEqual({})
  })
  it('always adds up for random weights', () => {
    const r = rng(3)
    for (let i = 0; i < 1000; i++) {
      const n = 1 + Math.floor(r() * 6)
      const w: Record<string, number> = {}
      for (let k = 0; k < n; k++) w['p' + k] = Math.round(r() * 12) / 4 + 0.25
      const price = Math.floor(r() * 50000)
      expect(sum(Object.values(allocCents(price, w)))).toBe(price)
    }
  })
})

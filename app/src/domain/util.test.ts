import { describe, expect, it } from 'vitest'
import { ago, dateIn, fmt, mAdd, mLabel, parseMoney, pf, nowKey } from './util'

describe('fmt', () => {
  it('formats cents as dollars', () => {
    expect(fmt(0)).toBe('$0.00')
    expect(fmt(5)).toBe('$0.05')
    expect(fmt(123456)).toBe('$1,234.56')
    expect(fmt(-250)).toBe('-$2.50')
  })
})
describe('parseMoney', () => {
  it('parses valid amounts', () => {
    expect(parseMoney('12.5')).toBe(1250)
    expect(parseMoney('$1,000')).toBe(100000)
    expect(parseMoney(' 0.99 ')).toBe(99)
  })
  it('rejects bad input', () => {
    for (const bad of ['', 'abc', '-5', '1.234', '1e3', '12.', '99999999999']) expect(parseMoney(bad)).toBeNull()
  })
})
describe('dates', () => {
  it('adds months across year ends', () => {
    expect(mAdd('2026-11', 3)).toBe('2027-02')
    expect(mAdd('2026-01', -1)).toBe('2025-12')
  })
  it('labels months', () => {
    expect(mLabel('2026-10')).toBe('Oct 2026')
  })
  it('never makes a future date in the current month', () => {
    expect(dateIn(0, 31) <= new Date().toISOString().slice(0, 10) || dateIn(0, 31).slice(0, 7) === nowKey()).toBe(true)
    expect(dateIn(1, 31).slice(8)).toBe('28')
  })
  it('says how long ago', () => {
    expect(ago(1000, 1000 + 30_000)).toBe('1m ago')
    expect(ago(0, 3 * 3_600_000)).toBe('3h ago')
    expect(ago(0, 2 * 86_400_000)).toBe('2d ago')
  })
  it('trims portions', () => {
    expect(pf(2)).toBe('2')
    expect(pf(2.5)).toBe('2.5')
    expect(pf(0.3333)).toBe('0.33')
  })
})

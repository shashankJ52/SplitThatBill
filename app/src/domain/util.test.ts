import { describe, expect, it } from 'vitest'
import { ago, dateIn, fmt, mAdd, mLabel, parseMoney, pf, nowKey, whenLabel, clockIn } from './util'

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

describe('whenLabel', () => {
  const at = (d: number, h: number, m: number) => new Date(2026, 9, d, h, m).getTime()
  const now = at(20, 14, 30)
  it('says how long ago for the last hour', () => {
    expect(whenLabel(now - 20_000, '2026-10-20', { now })).toBe('Just now')
    expect(whenLabel(now - 11 * 60_000, '2026-10-20', { now })).toBe('11 min ago')
    expect(whenLabel(now - 59 * 60_000, '2026-10-20', { now })).toBe('59 min ago')
  })
  it('gives the time of day for earlier today and yesterday', () => {
    expect(whenLabel(at(20, 0, 20), '2026-10-20', { now, locale: 'en-US' })).toBe('Today, 12:20 AM')
    expect(whenLabel(at(20, 9, 5), '2026-10-20', { now, locale: 'en-US' })).toBe('Today, 9:05 AM')
    expect(whenLabel(at(19, 21, 5), '2026-10-19', { now, locale: 'en-US' })).toBe('Yesterday, 9:05 PM')
  })
  it('uses the date for older things, or the exact day and time when asked', () => {
    expect(whenLabel(at(18, 12, 32), '2026-10-18', { now, locale: 'en-US' })).toBe('2026-10-18')
    expect(whenLabel(at(14, 12, 32), '2026-10-14', { now, locale: 'en-US', exact: true })).toBe('Oct 14, 12:32 PM')
    expect(whenLabel(new Date(2025, 11, 31, 18, 5).getTime(), '2025-12-31', { now, locale: 'en-US', exact: true })).toBe('Dec 31, 2025, 6:05 PM')
  })
  it('is just the date when no time was recorded, and never shows a time in the future', () => {
    expect(whenLabel(undefined, '2026-10-12', { now, exact: true })).toBe('2026-10-12')
    expect(whenLabel(Number.NaN, '2026-10-12', { now })).toBe('2026-10-12')
    expect(whenLabel(now + 10 * 60_000, '2026-10-20', { now })).toBe('2026-10-20')
    expect(whenLabel(now + 5_000, '2026-10-20', { now })).toBe('Just now')
  })
  it('keeps the old call style working', () => {
    expect(whenLabel(now - 11 * 60_000, '2026-10-20', now)).toBe('11 min ago')
  })
})

describe('the same moment in different time zones', () => {
  // One payment recorded at 9:05 PM on Oct 19 in California (PDT, UTC-7) = 12:05 AM Oct 20 in Boston = 9:35 AM Oct 20 in India
  const moment = Date.UTC(2026, 9, 20, 4, 5)
  const zones = { california: 'America/Los_Angeles', boston: 'America/New_York', india: 'Asia/Kolkata' }
  const view = (tz: string, now: number, exact = true) => whenLabel(moment, '2026-10-19', { now, locale: 'en-US', timeZone: tz, exact })

  it('reads as each person\'s own local time, a day apart where the date differs', () => {
    // two hours later: still the evening of Oct 19 in California, already Oct 20 for the other two
    const later = Date.UTC(2026, 9, 20, 6, 0)
    expect(view(zones.california, later)).toBe('Today, 9:05 PM')
    expect(view(zones.boston, later)).toBe('Today, 12:05 AM')
    expect(view(zones.india, later)).toBe('Today, 9:35 AM')
    // eight hours after the payment it is the next morning in California, so the payment is now "yesterday" there only
    const nextMorning = Date.UTC(2026, 9, 20, 12, 0)
    expect(view(zones.california, nextMorning)).toBe('Yesterday, 9:05 PM')
    expect(view(zones.boston, nextMorning)).toBe('Today, 12:05 AM')
    expect(view(zones.india, nextMorning)).toBe('Today, 9:35 AM')
  })
  it('shows the exact local day and time once it is older', () => {
    const week = Date.UTC(2026, 9, 27, 12, 0)
    expect(view(zones.california, week)).toBe('Oct 19, 9:05 PM')
    expect(view(zones.boston, week)).toBe('Oct 20, 12:05 AM')
    expect(view(zones.india, week)).toBe('Oct 20, 9:35 AM')
  })
  it('how long ago does not depend on the zone at all', () => {
    const soon = moment + 11 * 60_000
    for (const tz of Object.values(zones)) expect(whenLabel(moment, '2026-10-19', { now: soon, timeZone: tz })).toBe('11 min ago')
  })
  it('clockIn uses the zone given, or the device\'s own', () => {
    expect(clockIn(moment, 'en-US', zones.india)).toBe('9:35 AM')
    expect(clockIn(Date.UTC(2026, 9, 20, 15, 30), 'en-GB', zones.india)).toBe('21:00') // 24-hour style where that is the habit
    expect(clockIn(Date.UTC(2026, 9, 20, 15, 30), 'en-US', zones.india)).toBe('9:00 PM')
    expect(clockIn(moment, 'en-US')).toBe(new Date(moment).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }))
  })
})

import { describe, expect, it } from 'vitest'
import * as A from '../data/actions'
import { others, recentPeople, scanHiddenCount } from './selectors'
import { seedState } from './seed'

const s0 = seedState(Date.UTC(2026, 9, 19, 12))

describe('1-1 suggestions on the scan screen', () => {
  it('a removed person drops out of the suggestions but is still a person', () => {
    const first = recentPeople(s0, 5)[0]
    const s1 = A.hideScanPerson(s0, first)
    expect(recentPeople(s1, 5)).not.toContain(first)
    expect(others(s1)).toContain(first)
    expect(scanHiddenCount(s1)).toBe(1)
  })

  it('the next person fills the gap, and everyone can be brought back', () => {
    const all = recentPeople(s0, 10)
    const s1 = A.hideScanPerson(s0, all[0])
    expect(recentPeople(s1, 10)).toEqual(all.slice(1))
    const s2 = A.showScanPeople(s1)
    expect(recentPeople(s2, 10)).toEqual(all)
    expect(scanHiddenCount(s2)).toBe(0)
  })

  it('removing the same person twice counts once, and it does not touch the sidebar list', () => {
    const p = recentPeople(s0, 5)[0]
    const s1 = A.hideScanPerson(A.hideScanPerson(s0, p), p)
    expect(scanHiddenCount(s1)).toBe(1)
    expect(s1.layout?.sideHidden ?? []).toEqual(s0.layout?.sideHidden ?? [])
  })
})

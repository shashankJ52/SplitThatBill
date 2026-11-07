import { describe, expect, it } from 'vitest'
import * as A from '../data/actions'
import { others, recentPeople } from './selectors'
import { seedState } from './seed'

const s0 = seedState(Date.UTC(2026, 9, 19, 12))

describe('1-1 suggestions on the scan screen', () => {
  it('a removed person drops out of the suggestions but is still a person', () => {
    const first = recentPeople(s0, 5)[0]
    const s1 = A.hideScanPerson(s0, first)
    expect(recentPeople(s1, 5)).not.toContain(first)
    expect(others(s1)).toContain(first)
  })

  it('the next person fills the gap', () => {
    const all = recentPeople(s0, 10)
    const s1 = A.hideScanPerson(s0, all[0])
    expect(recentPeople(s1, 10)).toEqual(all.slice(1))
  })

  it('picking them again from All people puts them back, and only them', () => {
    const all = recentPeople(s0, 10)
    const s1 = A.hideScanPerson(A.hideScanPerson(s0, all[0]), all[1])
    const s2 = A.showScanPerson(s1, all[0])
    expect(recentPeople(s2, 10)).toContain(all[0])
    expect(recentPeople(s2, 10)).not.toContain(all[1])
  })

  it('removing the same person twice keeps one entry, putting back someone not removed changes nothing, and the sidebar list is untouched', () => {
    const p = recentPeople(s0, 5)[0]
    const s1 = A.hideScanPerson(A.hideScanPerson(s0, p), p)
    expect(s1.layout?.scanHidden).toEqual([p])
    expect(A.showScanPerson(s0, p)).toBe(s0)
    expect(s1.layout?.sideHidden ?? []).toEqual(s0.layout?.sideHidden ?? [])
  })
})

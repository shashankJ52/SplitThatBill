import { describe, expect, it } from 'vitest'
import { seedState } from './seed'
import * as S from './selectors'
import { ME } from './types'
import { mAdd, nowKey } from './util'

const s0 = seedState(1_800_000_000_000)

describe('overall totals', () => {
  it('net out per person and match the sum of group nets', () => {
    const o = S.overallTotals(s0)
    const sumNets = s0.ledgers.reduce((a, l) => a + (S.groupTotals(l).owed - S.groupTotals(l).owe), 0)
    expect(o.owed - o.owe).toBe(sumNets)
  })
})

describe('filters', () => {
  it('splits groups by who owes whom', () => {
    expect(S.filteredGroups(s0, 'net').map((g) => g.id)).toEqual(['g1', 'g2'])
    expect(S.filteredGroups(s0, 'owe').map((g) => g.id)).toEqual(['g1'])
    expect(S.filteredGroups(s0, 'owed').map((g) => g.id)).toEqual(['g2'])
  })
  it('lists 1-1 people with money outstanding, biggest first', () => {
    const net = S.filteredPeople(s0, 'net')
    expect(net.map((x) => x.p)).toEqual(['james', 'sam'])
    expect(net[0].t).toBeGreaterThan(net[1].t)
    expect(S.filteredPeople(s0, 'owe')).toEqual([])
  })
})

describe('recents', () => {
  it('orders groups and people by latest activity', () => {
    expect(S.recentGroups(s0, 5).map((g) => g.id)).toContain('g1')
    expect(S.recentPeople(s0, 2)).toHaveLength(2)
  })
})

describe('months', () => {
  it('runs from the earliest bill to the current month, at least three months', () => {
    const m = S.monthsAsc(S.ledgerById(s0, 'g1')!)
    expect(m.length).toBeGreaterThanOrEqual(3)
    expect(m.at(-1)).toBe(nowKey())
    expect(m[m.length - 2]).toBe(mAdd(nowKey(), -1))
  })
  it('month stats add up in every month for every group', () => {
    for (const id of ['g1', 'g2']) {
      const l = S.ledgerById(s0, id)!
      for (const k of S.monthsAsc(l)) {
        const st = S.monthStats(l, k)
        const sum = (o: Record<string, number>) => Object.values(o).reduce((a, x) => a + x, 0)
        expect(sum(st.share)).toBe(st.tot)
        expect(sum(st.paid)).toBe(st.tot)
        expect(sum(st.cat)).toBe(st.tot)
      }
    }
  })
})

describe('notes view', () => {
  it('filters by group or Just me and searches group names', () => {
    expect(S.noteEntries(s0, 'n', null, '', 'n').every((e) => e.ctx === 'n')).toBe(true)
    expect(S.noteEntries(s0, 'n', null, '', 'g:g2').map((e) => e.n.id)).toEqual(['gl3'])
    expect(S.noteEntries(s0, 'n', null, 'friday', 'all').map((e) => e.n.id)).toEqual(['gl3'])
    expect(S.noteEntries(s0, 'n', null, 'zzz', 'all')).toEqual([])
  })
  it('respects a custom order, newest first for unordered ones', () => {
    const s = { ...s0, noteOrder: ['n:m3', 'n:m1'] }
    const ids = S.noteEntries(s, 'n', null, '', 'n').map((e) => e.n.id)
    expect(ids.slice(-2)).toEqual(['m3', 'm1'])
  })
  it('lists every list of one group', () => {
    expect(S.noteEntries(s0, 'g', 'g1', '', 'all').map((e) => e.n.id).sort()).toEqual(['gl1', 'gl2'])
  })
  it('knows when a note is done', () => {
    expect(S.isDone({ id: 'x', title: '', memo: '', ts: 0, items: [{ id: 1, t: 'a', done: true }] })).toBe(true)
    expect(S.isDone({ id: 'x', title: '', memo: '', ts: 0, items: [] })).toBe(false)
  })
})

describe('names', () => {
  it('shows You to yourself and your first name to others', () => {
    expect(S.personName(s0, ME)).toBe('You')
    expect(S.personName(s0, ME, true)).toBe('Shashank')
    expect(S.personName(s0, 'james')).toBe('James')
    expect(S.personName(s0, 'ghost')).toBe('Someone')
  })
  it('counts unread alerts', () => {
    expect(S.unreadCount(s0)).toBe(2)
  })
})

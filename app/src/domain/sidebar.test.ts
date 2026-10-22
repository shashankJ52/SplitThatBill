import { describe, expect, it } from 'vitest'
import * as A from '../data/actions'
import { clampSide, SIDE_MAX, SIDE_MIN } from '../ui/sideWidth'
import { makeBill } from './bills'
import { emptyState } from './seed'
import * as S from './selectors'
import { ME, type AppLedger, type AppState } from './types'

const profile = { name: 'Me', email: 'm@x.co', tag: 'me' }
const names = ['amy', 'ben', 'cat', 'dan', 'eve', 'fay']
const bill = (id: string, p: string, date: string) =>
  makeBill({ id, title: id, date, ts: Date.parse(`${date}T12:00:00`), payer: ME, by: ME, rt: 1000, people: [ME, p], items: [{ id: 1, name: 'x', qty: 1, price: 1000, a: { mode: 'even', even: [ME, p], por: {} } }] })
const one = (p: string, date: string | null): AppLedger => ({ id: `o-${p}`, kind: 'one', with: p, members: [ME, p], simplify: false, bills: date ? [bill(`b-${p}`, p, date)] : [], payments: [], lists: [], roles: { [ME]: 'owner', [p]: 'member' } })
/** amy is the oldest, fay the newest; eve has nothing in her 1-1 yet */
function setup(layout?: AppState['layout']): AppState {
  const ledgers = names.map((p, i) => one(p, p === 'eve' ? null : `2026-10-${String(10 + i).padStart(2, '0')}`))
  return { ...emptyState(profile, ''), ledgers, layout, people: { [ME]: { id: ME, name: 'You', user: true }, ...Object.fromEntries(names.map((p) => [p, { id: p, name: p, user: true, tag: p }])) } }
}

describe('the sidebar’s recent 1-1s', () => {
  it('shows the four most recent people, newest first, and leaves out empty 1-1 splits', () => {
    expect(S.sidePeople(setup())).toEqual(['fay', 'dan', 'cat', 'ben'])
    expect(S.sideCandidates(setup())).toEqual(['fay', 'dan', 'cat', 'ben', 'amy'])
  })
  it('follows the order you dragged them in, with anyone you never placed after', () => {
    expect(S.sidePeople(setup({ people: ['amy', 'ben'] }))).toEqual(['amy', 'ben', 'fay', 'dan'])
  })
  it('lets you hide people, and the next most recent fills the space', () => {
    let s = setup()
    s = A.hideSidePerson(s, 'fay')
    s = A.hideSidePerson(s, 'dan')
    expect(S.sidePeople(s)).toEqual(['cat', 'ben', 'amy'])
    expect(S.sideHiddenCount(s)).toBe(2)
  })
  it('brings everyone back', () => {
    const s = A.showSidePeople(A.hideSidePerson(setup(), 'fay'))
    expect(S.sidePeople(s)[0]).toBe('fay')
    expect(S.sideHiddenCount(s)).toBe(0)
  })
  it('hiding someone from the sidebar does not touch the Groups tab', () => {
    const s = A.hideSidePerson(setup(), 'fay')
    expect(S.arrangedPeople(s, 'net').map((x) => x.p)).toContain('fay')
    expect(s.layout?.dismissed).toBeUndefined()
  })
  it('hiding the same person twice counts once', () => {
    const s = A.hideSidePerson(A.hideSidePerson(setup(), 'fay'), 'fay')
    expect(S.sideHiddenCount(s)).toBe(1)
  })
  it('shows fewer when there are fewer, and takes a different limit', () => {
    expect(S.sidePeople(setup(), 2)).toEqual(['fay', 'dan'])
    expect(S.sidePeople({ ...setup(), ledgers: [] })).toEqual([])
  })
})

describe('the sidebar width', () => {
  it('stays between the smallest and the largest that look right', () => {
    expect(clampSide(50)).toBe(SIDE_MIN)
    expect(clampSide(1000)).toBe(SIDE_MAX)
    expect(clampSide(300.4)).toBe(300)
  })
})

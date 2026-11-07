import { describe, expect, it } from 'vitest'
import { makeBill } from '../domain/bills'
import { emptyState } from '../domain/seed'
import { ME } from '../domain/types'
import type { AppState } from '../domain/types'
import { buildExportModel, bulletLetters } from './exportModel'

const s: AppState = {
  ...emptyState({ name: 'Alex Rivera', email: 'a@x.co', tag: 'alex' }, ''),
  people: {
    [ME]: { id: ME, name: 'You', user: true },
    jamie: { id: 'jamie', name: 'Jamie Fox', user: false },
    sam: { id: 'sam', name: 'Sam', user: false },
  },
}

const bill = makeBill({
  id: 'b', title: 'Trattoria Roma', loc: '12 Main St', date: '2026-10-20', payer: ME, by: ME, rt: 6000, people: [ME, 'jamie', 'sam'], tax: 500, tip: 500,
  items: [
    { id: 1, name: 'Ribeye', qty: 1, price: 3000, a: { mode: 'even', even: ['jamie'], por: {} } },
    { id: 2, name: 'Nachos', qty: 1, price: 2000, a: { mode: 'even', even: [ME, 'jamie', 'sam'], por: {} } },
  ],
})

describe('buildExportModel', () => {
  const m = buildExportModel(s, bill, { groupName: 'Flat', currency: 'EUR', link: 'https://x/b/abc' })
  it('copies the basics and names people as others see them', () => {
    expect(m).toMatchObject({ title: 'Trattoria Roma', loc: '12 Main St', date: '2026-10-20', groupName: 'Flat', currency: 'EUR', total: 6000, link: 'https://x/b/abc' })
    expect(m.paidBy).toBe('Alex')
    expect(m.people.map((p) => p.name)).toEqual(['Alex', 'Jamie Fox', 'Sam'])
    expect(m.people.map((p) => p.letter)).toEqual(['A', 'J', 'S'])
  })
  it('gives each person a colour that stays with their place in the bill', () => {
    expect(new Set(m.people.map((p) => p.color)).size).toBe(3)
  })
  it('says who paid and how much', () => {
    expect(m.payers.map((x) => [x.person.name, x.paid])).toEqual([['Alex', 6000]])
  })
  it('lists each item with who shares it', () => {
    expect(m.lines).toEqual([
      { name: 'Ribeye', qty: 1, price: 3000, who: [1] },
      { name: 'Nachos', qty: 1, price: 2000, who: [0, 1, 2] },
    ])
  })
  it('lists tax and tip, and who owes what to the person who paid', () => {
    expect(m.extras).toEqual([{ label: 'Tax', amt: 500 }, { label: 'Tip', amt: 500 }])
    expect(m.settle.map((x) => [x.person.name, x.net])).toEqual([['Jamie Fox', expect.any(Number)], ['Sam', expect.any(Number)], ['Alex', expect.any(Number)]])
    // everyone's balances cancel out, and the payer is the one who is owed
    expect(m.settle.reduce((n, x) => n + x.net, 0)).toBe(0)
    expect(m.settle.find((x) => x.person.name === 'Alex')?.net).toBeLessThan(0)
  })
  it('leaves out the item lines when the bill was split by custom amounts', () => {
    const f = makeBill({ id: 'f', title: 'Trip', date: '2026-10-20', payer: ME, by: ME, rt: 3000, people: [ME, 'jamie'], fixed: { [ME]: 1000, jamie: 2000 }, items: [{ id: 1, name: 'x', qty: 1, price: 3000, a: { mode: 'even', even: [], por: {} } }] })
    expect(buildExportModel(s, f, { groupName: null, currency: 'USD', link: null }).lines).toEqual([])
  })
  it('shows a discount with a minus', () => {
    const d = makeBill({ id: 'd', title: 'D', date: '2026-10-20', payer: ME, by: ME, rt: 900, people: [ME, 'jamie'], disc: { m: 'amt', v: 100 }, items: [{ id: 1, name: 'x', qty: 1, price: 1000, a: { mode: 'even', even: [ME, 'jamie'], por: {} } }] })
    expect(buildExportModel(s, d, { groupName: null, currency: 'USD', link: null }).extras).toEqual([{ label: 'Discount', amt: 100, minus: true }])
  })
})

describe('bullet letters', () => {
  it('stay one letter when nobody shares an initial', () => {
    expect(bulletLetters(['Ann', 'Ben', 'Cat'])).toEqual(['A', 'B', 'C'])
  })
  it('use two letters when people share an initial, so Sam and Sumit differ', () => {
    expect(bulletLetters(['You', 'Sam', 'Sumit', 'Ben'])).toEqual(['Y', 'Sa', 'Su', 'B'])
  })
  it('fall back to a number when even two letters match, and keep the others as they were', () => {
    expect(bulletLetters(['Sam', 'Sami', 'Sumit', 'Ben'])).toEqual(['S1', 'S2', 'Su', 'B'])
  })
  it('copes with empty names and different capital letters', () => {
    expect(bulletLetters(['', 'sam'])).toEqual(['?', 'S'])
  })
})

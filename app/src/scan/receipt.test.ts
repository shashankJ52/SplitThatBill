import { describe, expect, it } from 'vitest'
import { parseScan } from './receipt'

const good = {
  is_receipt: true, merchant: 'Trattoria Roma', location: '12 Main St', category: 'Eating out', date: '2026-10-20',
  items: [{ name: 'Caesar Salad', qty: 1, total_cents: 1250 }, { name: 'Beer', qty: 3, total_cents: 1800 }],
  tax_cents: 240, tip_cents: 500, discount_cents: 0, total_cents: 3790, hidden: ['card number', 'cardholder name'],
}

describe('parseScan', () => {
  it('turns a good answer into a scan', () => {
    expect(parseScan(good)).toEqual({
      merchant: 'Trattoria Roma', location: '12 Main St', category: 'Eating out', date: '2026-10-20',
      items: [{ name: 'Caesar Salad', qty: 1, cents: 1250 }, { name: 'Beer', qty: 3, cents: 1800 }],
      tax: 240, tip: 500, discount: 0, total: 3790, hidden: ['card number', 'cardholder name'],
    })
  })
  it('refuses what is not a receipt or has no items', () => {
    expect(parseScan({ ...good, is_receipt: false })).toBeNull()
    expect(parseScan({ ...good, items: [] })).toBeNull()
    expect(parseScan({ ...good, items: [{ name: '  ', qty: 1, total_cents: 5 }] })).toBeNull()
    expect(parseScan(null)).toBeNull()
    expect(parseScan('text')).toBeNull()
    expect(parseScan({ is_receipt: true })).toBeNull()
  })
  it('clamps and cleans untrusted values', () => {
    const r = parseScan({
      ...good, category: 'Weapons', date: 'yesterday', hidden: ['card number', 'card number', 'favourite colour'],
      items: [{ name: 'x'.repeat(200), qty: -4, total_cents: -50 }, { name: 'Big', qty: 1.6, total_cents: 9e15 }],
    })!
    expect(r.category).toBe('Other')
    expect(r.date).toBe('')
    expect(r.hidden).toEqual(['card number'])
    expect(r.items[0]).toEqual({ name: 'x'.repeat(60), qty: 1, cents: 0 })
    expect(r.items[1]).toEqual({ name: 'Big', qty: 2, cents: 10_000_000 })
  })
  it('rebuilds a missing total from the parts', () => {
    expect(parseScan({ ...good, total_cents: 0 })!.total).toBe(1250 + 1800 + 240 + 500)
  })
  it('keeps at most 80 items', () => {
    const items = Array.from({ length: 120 }, (_, i) => ({ name: `Item ${i}`, qty: 1, total_cents: 100 }))
    expect(parseScan({ ...good, items })!.items).toHaveLength(80)
  })
})

import { describe, expect, it } from 'vitest'
import { ev, makeBill } from './bills'
import { seedState } from './seed'
import { billLink, whatsappText } from './share'

const s = seedState(1_800_000_000_000)

describe('whatsappText', () => {
  it('names you by first name, lists who owes what, and links the bill', () => {
    const b = makeBill({ id: 'x', title: 'Dinner', loc: '12 Main St', date: '2026-10-19', payer: 'me', by: 'me', rt: 9000, people: ['me', 'james', 'priya'], items: [{ id: 1, name: 'Dinner', qty: 1, price: 9000, a: ev(['me', 'james', 'priya']) }] })
    const t = whatsappText(s, b, 'Apartment 4B', billLink('https://x.test', 'abc'))
    expect(t).toContain('🧾 Dinner')
    expect(t).toContain('📍 12 Main St')
    expect(t).toContain('Apartment 4B · 2026-10-19')
    expect(t).toContain('paid by Shashank')
    expect(t).toContain(`• James owes $\u00a030.00`)
    expect(t).toContain(`• Priya owes $\u00a030.00`)
    expect(t).not.toContain('• Shashank owes')
    expect(t).toContain('https://x.test/b/abc')
    expect(t).not.toMatch(/\bYou\b/)
  })
  it('handles two payers and a bill nobody owes on', () => {
    const b = makeBill({ id: 'y', title: 'Brunch', date: '2026-10-19', payer: 'me', paid: { me: 5000, james: 5000 }, by: 'me', rt: 10000, people: ['me', 'james'], items: [{ id: 1, name: 'x', qty: 1, price: 10000, a: ev(['me', 'james']) }] })
    const t = whatsappText(s, b, null, 'L')
    expect(t).toContain('paid by Shashank & James')
    expect(t).toContain('Nobody owes anything.')
    expect(t).not.toContain('📍')
  })
})

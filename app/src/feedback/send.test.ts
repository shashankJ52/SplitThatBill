import { describe, expect, it } from 'vitest'
import { RATINGS, sendFeedback, type FeedbackClient } from './send'

const ctx = { page: '/home', device: 'browser · test' }
const fake = (error: string | null = null) => {
  const calls: { name: string; args: Record<string, unknown> }[] = []
  const client: FeedbackClient = { rpc: async (name, args) => (calls.push({ name, args }), { error: error ? { message: error } : null }) }
  return { client, calls }
}

describe('sendFeedback', () => {
  it('sends the rating, message, contact and where it came from', async () => {
    const { client, calls } = fake()
    expect(await sendFeedback(client, { rating: 'love', message: 'Great', contact: ' me@example.com ' }, ctx)).toEqual({})
    expect(calls).toEqual([{ name: 'submit_feedback', args: { rating: 'love', message: 'Great', contact: 'me@example.com', page: '/home', device: 'browser · test' } }])
  })
  it('needs a rating before anything is sent', async () => {
    const { client, calls } = fake()
    expect((await sendFeedback(client, { rating: null, message: 'x', contact: '' }, ctx)).err).toMatch(/Pick how you feel/)
    expect(calls).toEqual([])
  })
  it('accepts a rating on its own, and no email', async () => {
    const { client } = fake()
    expect(await sendFeedback(client, { rating: 'up', message: '', contact: '' }, ctx)).toEqual({})
  })
  it('checks an email that was given, but only then', async () => {
    const { client, calls } = fake()
    expect((await sendFeedback(client, { rating: 'up', message: '', contact: 'not an email' }, ctx)).err).toMatch(/email/)
    expect(calls).toEqual([])
  })
  it('passes on the kind "slow down" answers and hides everything else', async () => {
    expect((await sendFeedback(fake('Thank you! Please wait a little before sending more.').client, { rating: 'up', message: '', contact: '' }, ctx)).err).toMatch(/^Thank you/)
    expect((await sendFeedback(fake('permission denied for table feedback').client, { rating: 'up', message: '', contact: '' }, ctx)).err).toMatch(/Could not send/)
  })
  it('says so when there is no server to send to', async () => {
    expect((await sendFeedback(null, { rating: 'up', message: '', contact: '' }, ctx)).err).toMatch(/connection to the server/)
  })
  it('has the three answers in order, from not liking it to loving it', () => {
    expect(RATINGS.map((r) => [r.value, r.symbol])).toEqual([['down', '−\u00a0$'], ['up', '+\u00a0$'], ['love', '$$']])
  })
})

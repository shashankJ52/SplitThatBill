import { EMAIL_RE } from '../domain/util'

export type Rating = 'down' | 'up' | 'love'

/** The three answers: how someone feels about the app, in the app's own language of money. */
export const RATINGS: { value: Rating; symbol: string; label: string; color: string; ink: string; size: number }[] = [
  // one, two... the more dollars, the more they like it; a no-break space keeps the signs from touching
  { value: 'down', symbol: '−\u00a0$', label: 'Don’t like it', color: '#EE352E', ink: '#fff', size: 22 },
  { value: 'up', symbol: '$', label: 'I like it', color: '#FCCC0A', ink: '#000', size: 24 },
  { value: 'love', symbol: '$\u00a0$\u00a0$', label: 'I love it', color: '#00933C', ink: '#fff', size: 17 },
]

export interface FeedbackInput {
  rating: Rating | null
  message: string
  /** an email to answer on, left by someone who is not signed in (optional) */
  contact: string
}

/** The one call the feedback needs from the backend; a fake stands in for it in tests. */
export interface FeedbackClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ error: { message: string } | null }>
}

/**
 * Send one piece of feedback. Returns an error message to show, or nothing when it went. The page and the kind of device
 * go along so a report of something broken can be found again.
 */
export async function sendFeedback(client: FeedbackClient | null, input: FeedbackInput, context: { page: string; device: string }): Promise<{ err?: string }> {
  if (!input.rating) return { err: 'Pick how you feel about it first.' }
  const contact = input.contact.trim()
  if (contact && !EMAIL_RE.test(contact)) return { err: 'That email does not look right. Leave it empty if you would rather not share one.' }
  if (!client) return { err: 'Feedback needs a connection to the server, which this copy of the app does not have.' }
  const { error } = await client.rpc('submit_feedback', {
    rating: input.rating,
    message: input.message,
    contact,
    page: context.page,
    device: context.device,
  })
  if (!error) return {}
  // the database words its own "slow down" answers kindly; anything else gets a plain one
  return { err: /^Thank you/.test(error.message) ? error.message : 'Could not send that just now. Check your connection and try again.' }
}

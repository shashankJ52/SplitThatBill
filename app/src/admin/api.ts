/** What the admin page asks the database for. The calls are made through a small interface so tests can stand in for it. */

export interface AdminClient {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>
}

export interface Overview {
  at: string
  users: { total: number; new7: number; new30: number; disabled: number }
  groups: { groups: number; ones: number }
  bills: { total: number; d7: number; d30: number }
  payments: { total: number; d7: number; d30: number }
  scans: { total: number; today: number; d7: number }
  feedback: { total: number; down: number; up: number; love: number }
}

export interface FeedbackRow {
  id: string
  created_at: string
  rating: 'down' | 'up' | 'love'
  message: string
  contact: string
  page: string
  device: string
  user_name: string | null
  user_tag: string | null
  user_email: string | null
}

export interface UserRow {
  id: string
  name: string
  tag: string
  email: string
  created_at: string
  last_sign_in_at: string | null
  disabled: boolean
  groups: number
  bills: number
  payments: number
  scans: number
  is_admin: boolean
}

export interface AdminData {
  overview: Overview
  feedback: FeedbackRow[]
  users: UserRow[]
}

/** The database's own word for "you are not an admin". */
export const NOT_ADMIN = /Admins only/i

/** Is the signed-in person an admin? False for anyone else, and for nobody signed in. */
export async function isAdmin(client: AdminClient): Promise<boolean> {
  const { data, error } = await client.rpc('is_admin')
  return !error && data === true
}

/** Everything the dashboard shows, in one go. Throws with the database's message when something is refused. */
export async function loadAdmin(client: AdminClient): Promise<AdminData> {
  const [o, f, u] = await Promise.all([client.rpc('admin_overview'), client.rpc('admin_feedback', { lim: 300 }), client.rpc('admin_users', { lim: 1000 })])
  for (const r of [o, f, u]) if (r.error) throw new Error(r.error.message)
  return { overview: o.data as Overview, feedback: (f.data ?? []) as FeedbackRow[], users: (u.data ?? []) as UserRow[] }
}

/** Switch a person off or back on. Returns an error message, or nothing when it worked. */
export async function setDisabled(client: AdminClient, id: string, off: boolean): Promise<{ err?: string }> {
  const { error } = await client.rpc('admin_set_disabled', { target: id, off })
  return error ? { err: error.message } : {}
}

/** How feedback splits, as whole percentages that always add to 100 (or all zero when there is none). */
export function feedbackShare(f: Overview['feedback']): { down: number; up: number; love: number } {
  if (!f.total) return { down: 0, up: 0, love: 0 }
  const raw = { down: (f.down / f.total) * 100, up: (f.up / f.total) * 100, love: (f.love / f.total) * 100 }
  const out = { down: Math.floor(raw.down), up: Math.floor(raw.up), love: Math.floor(raw.love) }
  let left = 100 - out.down - out.up - out.love
  // hand the leftover points to the biggest remainders
  for (const k of (Object.keys(raw) as (keyof typeof raw)[]).sort((a, b) => raw[b] - (out[b] as number) - (raw[a] - (out[a] as number)))) {
    if (left <= 0) break
    out[k] += 1
    left -= 1
  }
  return out
}

/** "3 days ago", "just now", for a timestamp from the database. */
export function since(iso: string | null, now = Date.now()): string {
  if (!iso) return 'never'
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000))
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  const d = Math.floor(s / 86400)
  return d < 30 ? `${d} day${d === 1 ? '' : 's'} ago` : new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

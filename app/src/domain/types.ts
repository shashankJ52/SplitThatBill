import type { Bill, Ledger, Payment, PersonId } from '../money'

export const ME: PersonId = 'me'

export interface Profile {
  name: string
  email: string
  tag: string
}

export interface Person {
  id: PersonId
  name: string
  /** true when they have the app (can be reminded in-app) */
  user: boolean
  tag?: string
}

export interface Comment {
  id: string
  by: PersonId
  text: string
  ts: number
  /** system note such as "You edited this bill" */
  sys?: boolean
}

export interface AppBill extends Bill {
  title: string
  loc: string
  cat: string
  /** YYYY-MM-DD */
  date: string
  /** who added the bill (only they can edit or delete it) */
  by: PersonId
  notes: string
  /** random token used in the public share link */
  token: string
  comments: Comment[]
}

export interface AppPayment extends Payment {
  date: string
  note?: string
  /** data URL of the proof image */
  img?: string | null
  /** payments split across several ledgers share one link id */
  linkId?: string
  /** who recorded it; missing means you */
  by?: PersonId
}

export interface ListItem {
  id: string
  t: string
  done: boolean
  doneBy?: PersonId | null
}

/** A list or note: a name, a checklist and an optional memo. */
export interface NoteList {
  id: string
  title: string
  memo: string
  items: ListItem[]
  ts: number
}

export type Role = 'owner' | 'admin' | 'member'

/** Someone who opened the group link and is waiting for an admin to let them in. */
export interface JoinRequest {
  pid: PersonId
  name: string
  tag?: string
  ts: number
}

export interface AppLedger extends Omit<Ledger, 'bills' | 'payments'> {
  name?: string
  color?: string
  /** the other person in a 1-1 ledger */
  with?: PersonId
  /** the owner, once the group is shared; missing on a group only you have */
  owner?: PersonId
  /** who may do what in a shared group */
  roles?: Record<PersonId, Role>
  /** invited but not yet accepted */
  invited?: PersonId[]
  /** left or removed; kept so old bills still show their names */
  former?: PersonId[]
  /** the group link code, when the link is on (admins only) */
  inviteCode?: string | null
  /** waiting to join through the group link (admins only) */
  requests?: JoinRequest[]
  bills: AppBill[]
  payments: AppPayment[]
  lists: NoteList[]
}

export interface Notif {
  id: string
  kind?: 'remind'
  text: string
  sub: string
  ts: number
  read: boolean
  billId?: string
  gid?: string
  pid?: string
  from?: PersonId
  msg?: string
}

export interface SentReminder {
  id: string
  to: PersonId
  gid: string | null
  amt: number
  text: string
  ts: number
}

export interface AppState {
  v: 1
  profile: Profile
  /** local stand-in for a signed-in session until the backend exists */
  password: string
  signedIn: boolean
  people: Record<PersonId, Person>
  ledgers: AppLedger[]
  notifs: Notif[]
  notes: NoteList[]
  /** custom order of Short notes (keys from noteKey) */
  noteOrder: string[]
  /** Short notes hidden from the personal window */
  hidden: string[]
  sent: SentReminder[]
}

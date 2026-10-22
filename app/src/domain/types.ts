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
  /** when it was added (milliseconds); missing on older data */
  ts?: number
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
  /** when it was recorded (milliseconds); missing on older data */
  ts?: number
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
  /** the currency amounts are written in; missing means the viewer's own default */
  currency?: string
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
  /** remind: a friend's reminder. invite: you were invited to a group. join_request: someone asked to join a group you run. */
  kind?: 'remind' | 'invite' | 'join_request'
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

/** How you like your Groups tab arranged. Personal, so it is not shared with the people in your groups. */
export interface Layout {
  /** people hidden from the laptop sidebar's recent 1-1s (they stay in the Groups tab) */
  sideHidden?: PersonId[]
  /** paper size for PDFs; missing means Letter in the USA, Canada and Mexico and A4 elsewhere */
  paper?: 'Letter' | 'A4'
  /** your default currency, used by every group and split that has not chosen its own */
  currency?: string
  /** group ids in the order you dragged them */
  groups?: string[]
  /** person ids in the order you dragged them */
  people?: string[]
  /** settled-up people you swiped away, with the date; they come back when something new happens */
  dismissed?: Record<PersonId, string>
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
  /** how the Groups tab is arranged; missing on data saved before this existed */
  layout?: Layout
}
